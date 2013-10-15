/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-16 / Meetin.gs
\*/

var Q    = require('q')
var http = require('request')
var util = require('util')
var zlib = require('zlib')

var USER_AGENT = ''
var HTTP_TIMEOUT = 12000
var REFRESH_INTERVAL = 333

var Cache = {
    has: function(key) {
        return (typeof this[key] !== 'undefined')
    },
    isCached: function(key) {
        return (this.has(key) && this[key].cached)
    },
    insert: function(key, start, stop, interval) {
        this[key] = {
            cached:   false,
            etag:     null,
            start:    start,
            stop:     stop,
            interval: interval
        }
    },
    update: function(key, headers, data, zipped) {
        if (typeof this[key] === 'undefined') return

        this[key].cached    = true
        this[key].etag      = headers.etag
        this[key].data      = data
        this[key].zipped    = zipped
        this[key].timestamp = Date.now()
    },
    touch: function(key) {
        if (this.has(key)) {
            this[key].timestamp = Date.now()
        }
    }
}

function zipToCache(entry) {
    var def = Q.defer()

    zlib.gzip(entry.data, function(err, zipped) {
        Cache.update(entry.url, entry.headers, entry.data, zipped)
        def.resolve(Cache[entry.url])
    })

    return def.promise
}

function httpGet(url) {
    var def = Q.defer()
    var headers = {'User-Agent': USER_AGENT}

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
        if (err) {
            def.reject({err: 500})
        }
        else if (response.statusCode === 304) {
            debug("etag \\o/", null)

            Cache.touch(url)
            def.resolve(Cache[url])
        }
        else if (response.statusCode !== 200) {
            def.reject({err: response.statusCode})
        }
        else {
            Q({url: url, headers: response.headers, data: data})
            .then(zipToCache)
            .then(def.resolve)
            .done()
        }
    })

    return def.promise
}

function refreshCache() {
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
            /// debug("UPDATing because", {sum: Cache[key].timestamp + Cache[key].interval, nyt: now})
            httpGet(key)
        }
    }

    purge.forEach(function(key) {
        delete Cache[key]
    })
}

function fetch(request) {
    var def = Q.defer()
    var url = request.url

    if (!Cache.has(url)) {
        debug("MITÄ, EN oo kuullukkaan", null)

        Cache.insert(url, request.start, request.stop, request.interval)
    }

    if (!Cache.isCached(url)) {
        debug("EI oo datoja tallessa", null)

        Q(url).then(httpGet).then(def.resolve).fail(def.resolve).done()
    }
    else {
        debug("KAIKKI on sulle heti nyt", null)

        def.resolve(Cache[url])
    }

    return def.promise
}

function init(name, version) {
    USER_AGENT = util.format(
        '%s/%s (Node.js %s, V8 %s) Meetin.gs Ltd',
        name, version, process.versions.node, process.versions.v8
    )

    setInterval(refreshCache, REFRESH_INTERVAL)
}

module.exports = {
    fetch: fetch,
    init:  init
}

function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: 1, colors: true}))
}
