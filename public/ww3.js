var KeyCodes = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,

  isArrow: function(keyCode) {
    return keyCode >= 37 && keyCode <= 40;
  }
};

var WW3 = function(options) {
  if(typeof options == 'undefined') options = {};

  this.display = {
    canvas: $('<canvas class="ww3-canvas" tabindex="1"></canvas>').get(0),
    players: $('<ul class="ww3-players"></ul>').get(0)
  };

  if('target' in options) {
    $(options.target).append(this.display.canvas, this.display.players);
    this.display.canvas.focus();
  }

  this.rot_speed = 'rot_speed' in options ? options.rot_speed : Math.PI;
  this.redraw_rate = 'redraw_rate' in options ? options.redraw_rate : 25;

  this.players = null;
  this._playerId = null;

  this._keys = {};
  this._keys[KeyCodes.LEFT] = this._keys[KeyCodes.RIGHT] = 
    this._keys[KeyCodes.UP] = this._keys[KeyCodes.DOWN] = false;
  this._gamz = new GamzClient();

  var self = this;

  this._gamz.onnotify = function(id) {
    self._notifyHandlers[id].apply(self, Array.prototype.slice.call(arguments, 1));
  };

  this._gamz.onopen = function() {
    self._opened();
  };

  this._gamz.open({port: 10001});
};

// fix for JS's modulus of negative numbers
WW3.mod = function(a, b) {
  return ((a%b)+b)%b;
};

WW3.prototype = {

  player: function() {
    return this.players[this._playerId];
  },

  width: function() {
    return this.display.canvas.width;
  },

  height: function() {
    return this.display.canvas.height;
  },

  _addPlayer: function(player) {
    this.players[player.get('id')] = player;
    player._li = $('<li></li>').get(0);
    if(player.get('id') == this._playerId) {
      player._li.style.color = '#00f';
    }
    $(this.display.players).append(player._li);
  },

  _removePlayer: function(player) {
    delete this.players[player.get('id')];
    $(player._li).remove();
  },

  _opened: function() {
    var self = this;

    this._gamz.act('info', [], function(width, height, players, playerId) {
      self.display.canvas.width = width;
      self.display.canvas.height = height;
      self._playerId = playerId;

      self.players = {};
      for(var i = 0; i < players.length; i++) {
        self._addPlayer(new WW3Player(self, players[i]));
      }
    });

    self.display.canvas.onkeydown = function(e) {
      if(KeyCodes.isArrow(e.keyCode)) {
        e.preventDefault();

        // some browsers fire keydown for each "press"-- we only want the first
        if(!self._keys[e.keyCode]) {
          self._keys[e.keyCode] = true;

          if(e.keyCode == KeyCodes.UP) {
            if(self._keys[KeyCodes.DOWN]) {
              self._stop();
            } else {
              self._forward();
            }
          } else if(e.keyCode == KeyCodes.DOWN) {
            if(self._keys[KeyCodes.UP]) {
              self._stop();
            } else {
              self._backward();
            }
          } else if(e.keyCode == KeyCodes.LEFT) {
            self._rotate(self._keys[KeyCodes.RIGHT] ? 0 : -1);
          } else {
            self._rotate(self._keys[KeyCodes.LEFT] ? 0 : 1);
          }
        }
      }
    };

    self.display.canvas.onkeyup = function(e) {
      if(KeyCodes.isArrow(e.keyCode)) {
        e.preventDefault();
        
        if(self._keys[e.keyCode]) {
          self._keys[e.keyCode] = false;

          if(e.keyCode == KeyCodes.UP) {
            if(self._keys[KeyCodes.DOWN]) {
              self._backward();
            } else {
              self._stop();
            }
          } else if(e.keyCode == KeyCodes.DOWN) {
            if(self._keys[KeyCodes.UP]) {
              self._forward();
            } else {
              self._stop();
            }
          } else if(e.keyCode == KeyCodes.LEFT) {
            self._rotate(self._keys[KeyCodes.RIGHT] ? 1 : 0);
          } else {
            self._rotate(self._keys[KeyCodes.LEFT] ? -1 : 0);
          }
        }
      }
    }

    var redraw;
    (redraw = function () {
      self._redraw();
      setTimeout(redraw, self.redraw_rate);
    })();
  },

  _backward: function() {
    this.player().predict().set('direction', -1);
    this._gamz.act('backward');
  },

  _forward: function() {
    this.player().predict().set('direction', 1);
    this._gamz.act('forward');
  },

  _stop: function() {
    this.player().predict().set('direction', 0);
    this._gamz.act('stop');
  },

  // direction: 1=CCW, -1=CW, 0=none
  _rotate: function(direction) {
    this.player().predict().set('rot_speed', direction*this.rot_speed);
    this._gamz.act('rotate', this.player().get('rot_speed'));
  },

  _redraw: function() {
    // only draw if loaded
    if(this._playerId === null) return;

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.display.canvas.width, this.display.canvas.height);

    ctx.fillStyle = 'black';
    for(var id in this.players) {
      ctx.fillStyle = id == this._playerId ? 'blue' : 'black';

      var player = this.players[id];
      player.predict();
      this._drawPlayer(ctx, player);
      player.refresh();
    }
  },

  _drawPlayer: function(ctx, player) {
    var h = player.get('heading');
    var x = player.x_int();
    var y = player.y_int();

    // TODO constants/options?
    var radius = 5;
    var point = 10;

    ctx.beginPath();
    // semi-circle
    ctx.arc(x, y, radius, h + 0.5*Math.PI, h - 0.5*Math.PI);
    // first side of the point
    var x_ = Math.cos(2*Math.PI - h)*point;
    var y_ = Math.sin(2*Math.PI - h)*point;
    ctx.lineTo(x + x_, y - y_);
    // second side of the point
    ctx.closePath();
    ctx.fill();
  },

  _notifyHandlers: {

    connect: function(player) {
      this._addPlayer(new WW3Player(this, player));
    },

    disconnect: function(player) {
      this._removePlayer(this.players[player.i]);
    },

    // updates player data
    data: function(datas) {
      if(!(datas instanceof Array)) {
        datas = [datas];
      }

      for(var i = 0; i < datas.length; i++) {
        // TODO- we might want to remove our own heading/rot_speed once again?
        this.players[datas[i].i].update(datas[i]);
      }
    }

  }

};

var WW3Player = function(game, data) {
  this.game = game;

  this._real = {};
  this._predicted = {};
  this._li = null;

  if(typeof data == 'object') {
    this.update(data);
  }
};

WW3Player.prototype = {

  x_int: function() {
    return WW3.mod(Math.round(this.get('x')), this.game.width());
  },

  y_int: function() {
    return WW3.mod(Math.round(this.get('y')), this.game.height());
  },

  get: function(attr, real) {
    return !real && attr in this._predicted ? this._predicted[attr] : this._real[attr];
  },

  set: function(attr, value) {
    this._real[attr] = value;
    delete this._predicted[attr];
  },
  
  update: function(data) {
    data = WW3Player.normalizeData(data);
    this._real['updated'] = new Date();
    for(var attr in data) {
      this._real[attr] = data[attr];
    }
    this._predicted = {};
    return this;
  },

  refresh: function() {
    if(this._li) {
      $(this._li).text(
        '#'+this.get('id')+' ('+Math.round(this.get('x'))+', '+Math.round(this.get('y'))+') rot '+
        (Math.round(this.get('heading')*10)/10)+' rad @ '+
        (Math.round(this.get('rot_speed')*10)/10)+' rad/s, lat '+
        Math.round(this.get('latency')*1000)+' ms'
      );
    }
    return this;
  },

  predict: function() {
    var now = new Date();
    this._predicted = this.extrapolate((now - this.get('updated'))/1000);
    this._predicted['updated'] = now;
    return this;
  },

  extrapolate: function(dTime) {
    var dx = 0.0, dy = 0.0, dh = 0.0;

    if(this.get('rot_speed') != 0.0) {
      // apply to an arc if rotating
      dh = this.get('rot_speed')*dTime; // dh = arc angle (theta)
      var radius = this.get('speed')/this.get('rot_speed');
      var h = this.get('heading');
      var l = Math.PI/2-h-dh;
      dx = this.get('direction') * radius * (Math.cos(l) - Math.sin(h));
      dy = this.get('direction') * radius * (Math.cos(h) - Math.sin(l));
    } else {
      var disp = this.get('direction')*this.get('speed')*dTime;
      dx = disp*Math.cos(this.get('heading'));
      dy = disp*Math.sin(this.get('heading'));
    }

    return {
      x: WW3.mod(this.get('x') + dx, this.game.width()),
      y: WW3.mod(this.get('y') + dy, this.game.height()),
      heading: WW3.mod(this.get('heading') + dh, 2*Math.PI)
    };
  }

};

// data sent over the wire is in an abbreviated format; this function will
// convert it to the full format if necessary
WW3Player.normalizeData = function(data) {
  if('id' in data) {
    return data;
  } else {
    norm = {};
    if('i' in data) norm.id = data.i;
    if('x' in data) norm.x = data.x;
    if('y' in data) norm.y = data.y;
    if('d' in data) norm.direction = data.d;
    if('s' in data) norm.speed = data.s;
    if('r' in data) norm.rot_speed = data.r;
    if('h' in data) norm.heading = data.h;
    if('l' in data) norm.latency = data.l;
    return norm;
  }
};