var KeyCodes = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,

  isArrow: function(keyCode) {
    return keyCode >= 37 && keyCode <= 40;
  }
};

/*
 * Options:
 *   target = element|[none]
 *     the containing element to which the canvas and players list will be appended
 *   prediction = none|extrapolate|[interpolate]
 *     the position prediction scheme to use when rendering players
 */
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

  this.prediction = 'prediction' in options ? options.prediction : 'interpolate';
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
    player._li = $('<li></li>').get();
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
        self._addPlayer(new WW3Player(self, self._translateData(players[i])));
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
    this._predict(this.player());
    this.player().set('direction', -1);
    this._gamz.act('backward');
  },

  _forward: function() {
    this._predict(this.player());
    this.player().set('direction', 1);
    this._gamz.act('forward');
  },

  _stop: function() {
    this._predict(this.player());
    this.player().set('direction', 0);
    this._gamz.act('stop');
  },

  // direction: 1=CCW, -1=CW, 0=none
  _rotate: function(direction) {
    this._predict(this.player());
    this.player().set('rot_speed', direction*this.rot_speed);
    this._gamz.act('rotate', this.player().get('rot_speed'));
  },

  _redraw: function() {
    // only draw if loaded
    if(this._playerId === null) return;

    var predictor = this._predictor();

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.display.canvas.width, this.display.canvas.height);

    ctx.fillStyle = 'black';
    for(var id in this.players) {
      var player = this.players[id];
      ctx.fillStyle = id == this._playerId ? 'blue' : 'black';
      predictor.call(this, player)
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

  _predictor: function() {
    return this['_predict_'+this.prediction];
  },

  _predict: function(player) {
    this._predictor().call(this, player);
  },

  _predict_none: function(player) {
    player._predicted = {};
  },

  // TODO- consider rot_speed
  _predict_extrapolate: function(player) {
    // extrapolate distance travelled since last update
    var now = new Date();
    var dTime = (now - player.get('updated'))/1000;

    // apply this to an arc if rotating
    var dx = 0.0, dy = 0.0, dh = 0.0;
    if(player.get('rot_speed') != 0.0) {
      // dh = arc angle
      dh = player.get('rot_speed')*dTime;
      var radius = player.get('speed')/player.get('rot_speed');
      var h = player.get('heading');
      dx = player.get('direction') * radius * (Math.sin(dh-h) + Math.sin(h));
      dy = player.get('direction') * radius * (Math.cos(dh-h) - Math.cos(h));
    } else {
      var disp = player.get('direction')*player.get('speed')*dTime;
      dx = disp*Math.cos(player.get('heading'));
      dy = disp*Math.sin(player.get('heading'));
    }

    player._predicted = {
      x: WW3.mod(player.get('x') + dx, this.width()),
      y: WW3.mod(player.get('y') + dy, this.height()),
      heading: WW3.mod(player.get('heading') + dh, 2*Math.PI),
      updated: now
    };
  },

  _predict_interpolate: function(player) {
    // TODO
    this._predict_extrapolate(player);
  },

  // translates condensed (wire) formatted player attributes to the format used
  // by the Player class
  _translateData: function(wire) {
    data = {};
    if('i' in wire) data.id = wire.i;
    if('x' in wire) data.x = wire.x;
    if('y' in wire) data.y = wire.y;
    if('d' in wire) data.direction = wire.d;
    if('s' in wire) data.speed = wire.s;
    if('r' in wire) data.rot_speed = wire.r;
    if('h' in wire) data.heading = wire.h;
    if('l' in wire) data.latency = wire.l;
    return data;
  },

  _notifyHandlers: {

    connect: function(player) {
      this._addPlayer(new WW3Player(this, this._translateData(player)));
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
        var data = this._translateData(datas[i]);
        // TODO- we might want to remove our own heading/rot_speed once again?
        this.players[data.id].update(data);
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
    this._real['updated'] = new Date();
    for(var attr in data) {
      this._real[attr] = data[attr];
    }
    this._predicted = {};
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
  }

};