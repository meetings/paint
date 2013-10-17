/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-25 / Meetin.gs
\*/

var Q           = require('q')
var _           = require('underscore')
var httpRequest = require('request')
var util        = require('util')
var zlib        = require('zlib')

var USER_AGENT       = ''
var HTTP_TIMEOUT     = 12000
var REFRESH_INTERVAL = 333

var isPeerOK = null

var Lock = {
    lock: function(key) {
        if (_.isUndefined(this[key])) {
            this[key] = true
            return true
        }
        return false
    },

    release: function(key) {
        delete this[key]
    }
}

var Cache = {
    exists: function(key) {
        return (!_.isUndefined(this[key]))
    },

    has: function(key) {
        return (this.exists(key) && this[key].cached)
    },

    insert: function(req) {
        this[req.url] = {
            cached:   false,
            origin:   !req.peer,
            source:   req.source,
            headers:  {},
            start:    req.start,
            stop:     req.stop,
            interval: req.interval
        }
    },

    update: function(key, headers, data, zipped) {
        if (_.isUndefined(this[key])) return

        this[key].cached    = true
        this[key].headers   = headers
        this[key].data      = data
        this[key].zipped    = zipped
        this[key].timestamp = Date.now()
    },

    touch: function(key) {
        if (this.exists(key)) {
            this[key].timestamp = Date.now()
        }
    }
}

function zipToCache(entry) {
    var def = Q.defer()

    zlib.gzip(entry.data, function(err, zipped) {
        Cache.update(entry.url, entry.headers, entry.data, zipped)
        def.resolve(Cache[entry.url])
        util.log('Updated entry: ' + entry.url)
    })

    return def.promise
}

function httpGet(req) {
    var def = Q.defer()
    var headers = {'User-Agent': USER_AGENT}

    if (Cache[req.url].headers.etag) {
        headers['If-None-Match'] = Cache[req.url].headers.etag
    }
    else {
        headers['Cache-Control'] = 'no-cache'
    }

    var opts = {
        uri:     req.source,
        timeout: HTTP_TIMEOUT,
        headers: headers
    }

    httpRequest(opts, function(err, response, data) {
        if (err) {
            def.reject({url: req.url})
        }
        else if (response.statusCode === 304) {
            Cache.touch(req.url)
            def.resolve(Cache[req.url])
        }
        else if (response.statusCode !== 200) {
            def.reject({url: req.url})
        }
        else {
            Q({url: req.url, headers: response.headers, data: data})
            .then(zipToCache)
            .done(def.resolve)
        }
    })

    return def.promise
}

function makeRefresh(key) {
    var peerOK = isPeerOK()
    var origin = Cache[key].origin

    if (Lock.lock(key)) {
        var request = {url: key}

        /* This is origin, peer is ok ->
         * do peer request
         */
        if (origin && peerOK > 0) {
            request.source = Cache[key].source
        }
        /* This is origin, peer is broken ->
         * cannot do peer request, do source request
         */
        else if (origin && peerOK < -1) {
            request.source = key
        }
        /* We are not origin, but peer has failed a lot ->
         * do source request
         */
        else if (!origin && peerOK < -5) {
            request.source = key
        }
        /* This is not origin, all is good ->
         * not my problem, skip silently
         */
        else {
            Lock.release(key)
            return
        }

        util.log('Sending refresh: ' + request.source)

        Q(request).then(httpGet).done(function() {
            Lock.release(key)
        },
        function() {
            Lock.release(key)
        })
    }
}

function refreshCache() {
    var purge = []
    var now = Date.now()

    for (var key in Cache) {
        /* If initial fetch hasn't happened yet, skip.
         */
        if (_.isUndefined(Cache[key].cached)) {
            continue
        }

        /* If refresh is set to future, skip.
         */
        if (Cache[key].start > now) {
            continue
        }

        /* If end of refresh time has been reached, purge.
         */
        if (Cache[key].stop < now) {
            purge.push(key)
            continue
        }

        /* If cache is outdated, do refresh.
         */
        if (Cache[key].timestamp + Cache[key].interval < now) {
            makeRefresh(key)
        }
    }

    purge.forEach(function(key) {
        delete Cache[key]
    })
}

function ensure(req) {
    var def = Q.defer()

    if (!Cache.exists(req.url)) {
        util.log('New cache entry: ' + req.url)

        Cache.insert(req)
    }

    /* If content is in cache and if this is not peer request
     * (i.e. refresh request), reply from cache and be done
     * with it.
     */
    if (Cache.has(req.url) && !req.peer) {
        def.resolve(Cache[req.url])
    }
    else {
        Q(req).then(httpGet).done(def.resolve, def.reject)
    }

    return def.promise
}

function init(name, version, statusFunc) {
    USER_AGENT = util.format(
        '%s/%s (Node.js %s, V8 %s) Meetin.gs Ltd',
        name, version, process.versions.node, process.versions.v8
    )

    isPeerOK = statusFunc

    setInterval(refreshCache, REFRESH_INTERVAL)
}

function toString() {
    return util.inspect(Cache, {depth: 1, colors: false})
}

module.exports = {
    init:     init,
    ensure:   ensure,
    toString: toString
}

/* function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: 1, colors: true}))
} */
