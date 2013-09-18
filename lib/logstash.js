var dgram, redis;

function loadRedis() {
    try {
        redis = require('redis');
    } catch (e) {
        throw new Error('Attempted to use redis transport without installing the redis module');
    }
}

var Logstash = module.exports = function (opts, name) {
    if (!(this instanceof Logstash)) return new Logstash(opts, name);

    this.name = name || '';
    this.host = opts.host || '127.0.0.1';
    this.source = opts.source;
    this.source_host = opts.source_host;

    if (opts.redis) {
        loadRedis();
        this.redis = true;
        this.key = opts.key || 'bucker';
        this.port = opts.port || 6379;
        this.channel = opts.hasOwnProperty('channel') ? opts.channel : true;
        this.list = !this.channel;
        this.client = redis.createClient(this.port, this.host);
    } else if (opts.udp) {
        dgram = require('dgram');
        this.udp = true;
        this.port = opts.port || 9999;
        this.client = dgram.createSocket('udp4');
    }

};

Logstash.prototype.log = function (time, level, module, data, tags) {
    var packet = {};
    var name = module || this.name;
    var source = this.source || name;

    packet['@version'] = 1;
    packet['@timestamp'] = time.toISOString();
    packet['@type'] = 'bucker';
    packet.tags = tags;
    packet.source = source;
    if (this.source_host) packet.source_host = this.source_host;
    packet.module = name;
    packet.level = level;
    packet.message = data;

    this.send(packet);
};

Logstash.prototype.access = function (module, data, tags) {
    var packet = {};
    var name = module || this.name;
    var source = this.source || name;

    packet['@version'] = 1;
    packet['@timestamp'] = data.time.toISOString();
    packet['@type'] = 'bucker_access';
    packet.tags = tags;
    packet.source = source;
    if (this.source_host) packet['@source_host'] = this.source_host;
    packet.url = data.url;
    packet.client = data.remote_ip;
    packet.size = data.length;
    packet.responsetime = data.response_time;
    packet.status = data.status;
    packet.method = data.method;
    packet.http_referrer = data.referer;
    packet.http_user_agent = data.agent;
    packet.http_version = data.http_ver;
    packet.message = [data.method, data.url, data.status].join(' ');

    this.send(packet);
};

Logstash.prototype.exception = function (time, module, err, tags) {
    var packet = {};
    var name = module || this.name;
    var source = this.source || name;

    packet['@version'] = 1;
    packet['@timestamp'] = time.toISOString();
    packet['@type'] = 'bucker';
    packet.tags = tags;
    packet.source = source;
    if (this.source_host) packet['@source_host'] = this.source_host;
    packet.module = name;
    packet.level = 'exception';
    packet.stack = err.stack.split('\n');
    packet.message = err.stack;

    this.send(packet);
};

Logstash.prototype.send = function (data) {
    var packet = JSON.stringify(data);

    if (this.redis) {
        if (this.channel) {
            this.client.publish(this.key, packet);
        } else {
            this.client.rpush(this.key, packet);
        }
    } else if (this.udp) {
        packet = new Buffer(packet);
        this.client.send(packet, 0, packet.length, this.port, this.host); 
    }
};
