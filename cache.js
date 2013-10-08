/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-08 / Meetin.gs
\*/

var _    = require('underscore')
var http = require('request')
var util = require('util')
var zlib = require('zlib')

var HTTP_TIMEOUT = 12000

var Cache = {}

function isKnownURL(url) {
    return _.has(Cache, url)
}

function isInCache(url) {
    return Cache[url].fetched
}

function fillCacheWithGoodness(url, result, callback) {
    var opts = {
        uri:     url,
        headers: { 'Cache-Control': 'no-cache' },
        timeout: HTTP_TIMEOUT
    }

    http(opts, function(err, response, data) {
        if (!err && response.statusCode === 200) {
            zlib.gzip(data, function(err, buffer) {
                Cache[url].data      = buffer
                Cache[url].fetched   = true
                Cache[url].timestamp = Date.now()

                if (_.isFunction(callback)) {
                    callback(result, 200, buffer)
                }
            })
        }
        else {
            Cache[url].fetched = false

            if (_.isFunction(callback)) {
                callback(result, 404, '')
            }
        }
    })
}

function refreshLikeTheresNoTomorrow() {
    var purge = []
    var now = Date.now()

    for (var key in Cache) {
        if (Cache[key].start > now) {
            continue
        }

        if (Cache[key].stop < now) {
            purge.push(key)
            continue
        }

        if (Cache[key].timestamp + Cache[key].interval < now) {
            fillCacheWithGoodness(key, null, null)
        }
    }

    purge.forEach(function(key) {
        util.log('Deleting a cache entry: ' + key)

        delete Cache[key]
    })
}

function reply(req, result, callback) {
    var key = req.url

    if (isKnownURL(key) && isInCache(key)) {
        callback(result, 200, Cache[key].data)
        return
    }

    if (!isKnownURL(key)) {
        util.log('Creating a cache entry for ' + key)

        Cache[key] = {
            fetched:  false,
            start:    req.start,
            stop:     req.stop,
            interval: req.interval
        }
    }

    fillCacheWithGoodness(key, result, callback)
}

function refresh() {
    setInterval(refreshLikeTheresNoTomorrow, 1000)
}

module.exports = {
    reply:   reply,
    refresh: refresh
}
