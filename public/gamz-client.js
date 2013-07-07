var GamzClient = function(options) {
  options = options || {};
  this.onopen = options.onopen || null;
  this.onclose = options.onclose || null;
  this.onnotify = options.onnotify || null;
  this.socket = null;
  this._handlers = [];
  this._notifyHandlers = {};
};

GamzClient.prototype = {
  _dispatch: function(msg) {
    var id = msg.shift().split(/_(.+)/);
    if(id[0] == 'n') {
      var handler = this._notifyHandlers[id[1]];
      if(!handler) {
        if(this.onnotify) {
          handler = this.onnotify;
          msg.unshift(id[1]);
        } else {
          alert('no handler found for notify '+id[1]);
        }
      }
      handler.apply(this, msg);
    } else {
      var handlers = this._handlers.shift();
      if(typeof handlers == 'object' && handlers[id[1]]) {
        handlers[id[1]].apply(this, msg);
      } else if(typeof handlers == 'function' && id[1] == 'success') {
        handlers.apply(this, msg);
      } else {
        console.log('response of type '+id[1]+' received but not handled');
      }
    }
  },

  /*
   * options available:
   *   secure, host, port, resource
   */
  open: function(options) {
    var uri, self = this;

    if(typeof options == "string") {
      uri = options;
    } else {
      var scheme, host, port, resource;
      options = options || {};
      port = options.port;
      if(options.secure) {
        scheme = 'wss';
        port = port && port != 443 ? ':'+port : '';
      } else {
        scheme = 'ws';
        port = port && port != 80 ? ':'+port : '';
      }
      host = options.host || window.location.hostname;
      resource = options.resource || '';
      uri = scheme+'://'+host+port+resource.replace(/^([^\/])/, '/$1');
    }

    this.socket = new WebSocket(uri);
    this.socket.onopen = function() {
      if(self.onopen) {
        self.onopen.call(self);
      }
    };
    this.socket.onclose = function() {
      self.socket = null;
      if(self.onclose) {
        self.onclose.call(self);
      }
    };
    this.socket.onmessage = function(msg) {
      msg = JSON.parse(msg.data);
      self._dispatch(msg);
    };
    this._dispatch;
    return this;
  },

  close: function() {
    this.socket.close();
  },

  act: function(action, data, handlers) {
    if(typeof data == 'undefined') {
      data = [];
    }
    this._handlers.push(handlers);
    var msg = [action].concat(data);
    this.socket.send(JSON.stringify(msg));
  },

  on: function(notify_id, handler) {
    if(typeof notify_id == 'string') {
      this._notifyHandlers[notify_id] = handler;
    } else {
      for(var nid in notify_id) {
        this.on(nid, notify_id[nid]);
      }
    }
  }
};