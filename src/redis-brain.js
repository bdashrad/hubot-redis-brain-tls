'use strict'

// Description:
//   Persist hubot's brain to redis
//
// Configuration:
//   REDISTOGO_URL or REDISCLOUD_URL or BOXEN_REDIS_URL or REDIS_URL.
//     URL format: redis://<host>:<port>[/<brain_prefix>]
//     URL format (UNIX socket): redis://<socketpath>[?<brain_prefix>]
//     If not provided, '<brain_prefix>' will default to 'hubot'.
//   REDIS_NO_CHECK - set this to avoid ready check (for exampel when using Twemproxy)
//
// Commands:
//   None

const Url = require('url')
const Redis = require('redis')

module.exports = function (robot) {
  let client, prefix
  const redisUrlEnv = getRedisEnv()
  const redisUrl = process.env[redisUrlEnv] || 'redis://localhost:6379'

  if (redisUrlEnv) {
    robot.logger.info(`hubot-redis-brain-tls: Discovered redis from ${redisUrlEnv} environment variable`)
  } else {
    robot.logger.info('hubot-redis-brain-tls: Using default redis on localhost:6379')
  }

  if (process.env.REDIS_NO_CHECK) {
    robot.logger.info('Turning off redis ready checks')
  }

  const info = Url.parse(redisUrl)

  if (info.hostname === '') {
    client = Redis.createClient(info.pathname)
    prefix = (info.query ? info.query.toString() : undefined) || 'hubot'
  } else if (process.env.REDIS_TLS_ENABLED) {
    client = (info.auth || process.env.REDIS_NO_CHECK)
              ? Redis.createClient(info.port, info.hostname, {tls: {}, no_ready_check: true})
            : Redis.createClient(info.port, info.hostname, {tls: {}})
    prefix = (info.path ? info.path.replace('/', '') : undefined) || 'hubot'
  } else {
    client = (info.auth || process.env.REDIS_NO_CHECK)
              ? Redis.createClient(info.port, info.hostname, {no_ready_check: true})
            : Redis.createClient(info.port, info.hostname)
    prefix = (info.path ? info.path.replace('/', '') : undefined) || 'hubot'
  }

  robot.brain.setAutoSave(false)

  const getData = () =>
    client.get(`${prefix}:storage`, function (err, reply) {
      if (err) {
        throw err
      } else if (reply) {
        robot.logger.info(`hubot-redis-brain-tls: Data for ${prefix} brain retrieved from Redis`)
        robot.brain.mergeData(JSON.parse(reply.toString()))
        robot.brain.emit('connected')
      } else {
        robot.logger.info(`hubot-redis-brain-tls: Initializing new data for ${prefix} brain`)
        robot.brain.mergeData({})
        robot.brain.emit('connected')
      }

      robot.brain.setAutoSave(true)
    })

  if (info.auth) {
    client.auth(info.auth.split(':')[1], function (err) {
      if (err) {
        return robot.logger.error('hubot-redis-brain-tls: Failed to authenticate to Redis')
      }

      robot.logger.info('hubot-redis-brain-tls: Successfully authenticated to Redis')
      getData()
    })
  }

  client.on('error', function (err) {
    if (/ECONNREFUSED/.test(err.message)) {

    } else {
      robot.logger.error(err.stack)
    }
  })

  client.on('connect', function () {
    robot.logger.debug('hubot-redis-brain-tls: Successfully connected to Redis')
    if (!info.auth) { getData() }
  })

  robot.brain.on('save', (data) => {
    if (!data) {
      data = {}
    }
    client.set(`${prefix}:storage`, JSON.stringify(data))
  })

  robot.brain.on('close', () => client.quit())
}

function getRedisEnv () {
  if (process.env.REDISTOGO_URL) {
    return 'REDISTOGO_URL'
  }

  if (process.env.REDISCLOUD_URL) {
    return 'REDISCLOUD_URL'
  }

  if (process.env.BOXEN_REDIS_URL) {
    return 'BOXEN_REDIS_URL'
  }

  if (process.env.REDIS_URL) {
    return 'REDIS_URL'
  }
}
