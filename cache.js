/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-10 / Meetin.gs
\*/

var _    = require('underscore')
var http = require('request')
var util = require('util')
var zlib = require('zlib')

var HTTP_TIMEOUT = 12000

var USER_AGENT = util.format(
    'paint/0.0.1 (Node.js %s, V8 %s) Meetin.gs Ltd',
    process.versions.node, process.versions.v8
)

var Cache = {}

function say() {
    util.log(util.format.apply(null, arguments))
}

function isKnownURL(url) {
    return _.has(Cache, url)
}

function isInCache(url) {
    return Cache[url].fetched
}

function shortStr(str) {
    if (str.length > 48) {
        return str.substr(0, 36) + '...' + str.substr(-36)
    }
    else {
        return str
    }
}

function compressAllTheThings(url, response, data, result, callback, gunzip ) {
    zlib.gzip(data, function(err, buffer) {
        Cache[url].data      = data
        Cache[url].gzip_data = buffer
        Cache[url].etag      = response.headers.etag
        Cache[url].fetched   = true
        Cache[url].timestamp = Date.now()

        say('Cache update: %s', shortStr(url))

        if (_.isFunction(callback)) {
            callback(result, 200, gunzip ? data : buffer )
        }
    })
}

function fillCacheWithGoodness(url, result, callback, gunzip ) {
    var headers = {
        'User-Agent': USER_AGENT
    }

    if (Cache[url].etag) {
        headers['If-None-Match'] = Cache[url].etag
    }
    else {
        headers['Cache-Control'] = 'no-cache'
    }

    var opts = {
        uri:     url,
        timeout: HTTP_TIMEOUT,
        headers: headers
    }

    http(opts, function(err, response, data) {
        var msg = 'OK'
        var code = 200

        if (err) {
            code = 500
            msg = 'Internal Proxy Error'
            say('Error fetching %s', shortStr(url))
        }
        else if (response.statusCode === 304) {
            Cache[url].timestamp = Date.now()
        }
        else if (response.statusCode !== 200) {
            msg = 'Unknown'
            code = response.statusCode
            say('Received a response code %s from %s', code, shortStr(url))
        }
        else {
            compressAllTheThings(url, response, data, result, callback, gunzip )
            callback = null
        }

        if (_.isFunction(callback)) {
            callback(result, code, msg)
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
        say('Deleting a cache entry: %s', shortStr(key))

        delete Cache[key]
    })
}

function reply(req, result, callback) {
    var key = req.url

    if (isKnownURL(key) && isInCache(key)) {
        callback(result, 200, req.gunzip ? Cache[key].data : Cache[key].gzip_data)
        return
    }

    if (!isKnownURL(key)) {
        say('Creating a cache entry: %s', shortStr(key))

        Cache[key] = {
            fetched:  false,
            etag:     null,
            start:    req.start,
            stop:     req.stop,
            interval: req.interval
        }
    }

    fillCacheWithGoodness(key, result, callback, req.gunzip )
}

function refresh() {
    setInterval(refreshLikeTheresNoTomorrow, 1000)
}

module.exports = {
    reply:   reply,
    refresh: refresh
}
