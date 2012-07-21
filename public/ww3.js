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

WW3.graduate = function(value, delta) {
  var sign = Math.round(value/Math.abs(value));
  return Math.abs(value) > delta ? delta*sign : value;
};

WW3.CORRECT_SPEED = 100;
WW3.CORRECT_ROT_SPEED = Math.PI/2;

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

  xPos: function(x) {
    return Math.max(0, Math.min(this.width(), x));
  },

  yPos: function(y) {
    return Math.max(0, Math.min(this.height(), y));
  },

  _addPlayer: function(player) {
    this.players[player.id] = player;
    player._li = $('<li></li>').get(0);
    if(player.id == this._playerId) {
      player._li.style.color = '#00f';
    }
    $(this.display.players).append(player._li);
  },

  _removePlayer: function(player) {
    delete this.players[player.id];
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
        var data = WW3Player.normalizeData(players[i]);
        self._addPlayer(new WW3Player(self, data));
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
    this.player().predict().direction = -1;
    this._gamz.act('backward');
  },

  _forward: function() {
    this.player().predict().direction = 1;
    this._gamz.act('forward');
  },

  _stop: function() {
    this.player().predict().direction = 0;
    this._gamz.act('stop');
  },

  // direction: 1=CCW, -1=CW, 0=none
  _rotate: function(direction) {
    this.player().predict().rot_speed = direction*this.rot_speed;
    this._gamz.act('rotate', this.player().rot_speed);
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
      player.predict().correct(WW3.CORRECT_SPEED, WW3.CORRECT_ROT_SPEED);
      this._drawPlayer(ctx, player);
      player.refresh();
    }
  },

  _drawPlayer: function(ctx, player) {
    var h = player.heading;
    var x = Math.round(player.x);
    var y = Math.round(player.y);

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

    connect: function(data) {
      data = WW3Player.normalizeData(data);
      this._addPlayer(new WW3Player(this, data));
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
        var data = WW3Player.normalizeData(datas[i]);
        this.players[data.id].interpolate(data, this.player().latency);

        if(data.id == this._playerId) {
          this.player().latency = data.latency;
        } else {
          this.players[data.id].update(data);
        }
      }
    }

  }

};

var WW3Player = function(game, data) {
  this.game = game;

  for(var attr in data) {
    this[attr] = data[attr];
  }

  this._updated = new Date();
  this._error = null;
  this._li = null;
};

var maxDx = 0, maxDy = 0;

WW3Player.prototype = {

  update: function(data) {
    this.predict();

    this.direction = data.direction;
    this.speed = data.speed;
    this.rot_speed = data.rot_speed;
    this.latency = data.latency;
  },
  
  interpolate: function(data, latency) {
    this.predict();

    var remote = WW3Player.extrapolate(data, latency);
    
    this._error = {
      x: this.game.xPos(data.x + remote.dX) - this.game.xPos(this.x),
      y: this.game.yPos(data.y + remote.dY) - this.game.yPos(this.y),
      h: WW3.mod(data.heading + remote.dH, 2*Math.PI) - WW3.mod(this.heading, 2*Math.PI)
    };
    this._corrected = new Date();

    // rotate whichever direction is closest to the correct one
    if(this._error.h > Math.PI) {
      this._error.h -= 2*Math.PI;
    } else if(this._error.h < -Math.PI) {
      this._error.h += 2*Math.PI;
    }

    return this;
  },

  correct: function(speed, rot_speed) {
    if(this._error) {
      var now = new Date();
      var dTime = (now - this._corrected)/1000;

      var dx = WW3.graduate(this._error.x, speed*dTime);
      var dy = WW3.graduate(this._error.y, speed*dTime);
      var dh = WW3.graduate(this._error.h, rot_speed*dTime);

      if(dx > maxDx) {
        maxDx = dx;
        console.log('dx = '+dx);
        console.log('dTime = '+dTime);
        console.log('error x = '+this._error.x);
      }

      this.x = this.game.xPos(this.x + dx);
      this._error.x -= dx;

      this.y = this.game.yPos(this.y + dy);
      this._error.y -= dy;

      this.heading = WW3.mod(this.heading + dh, 2*Math.PI);
      this._error.h -= dh;

      this._corrected = now;
    }

    return this;
  },

  predict: function() {
    var now = new Date();
    var delta = WW3Player.extrapolate(this, (now - this._updated)/1000);
    
    this.x = this.game.xPos(this.x + delta.dX);
    this.y = this.game.yPos(this.y + delta.dY);
    this.heading = WW3.mod(this.heading + delta.dH, 2*Math.PI);
    this._updated = now;
    
    return this;
  },

  refresh: function() {
    if(this._li) {
      $(this._li).text(
        '#'+this.id+' ('+Math.round(this.x)+', '+Math.round(this.y)+') rot '+
        (Math.round(this.heading*10)/10)+' rad @ '+
        (Math.round(this.rot_speed*10)/10)+' rad/s, lat '+
        Math.round(this.latency*1000)+' ms'
      );
    }
    return this;
  }

};

// given initial position/movement information, approximates the position
// and heading deltas after a given dTime seconds have elapsed.
//
//   initial = {
//     rot_speed: number rad/s
//     speed: number pix/s
//     heading: number rad
//     direction: 1 (forward), 0 (stationary), or -1 (backward)
//     x: number pixels
//     y: number pixels
//   }
//
//   dTime = number seconds
//
//   return = {
//     dX: number pixels
//     dY: number pixels
//     dH: number rad
//   }
//
WW3Player.extrapolate = function(initial, dTime) {
  var deltas = {
    dX: 0.0,
    dY: 0.0,
    dH: 0.0
  };

  var sinH = Math.sin(initial.heading);
  var cosH = Math.cos(initial.heading);

  if(initial.rot_speed != 0.0) {
    deltas.dH = initial.rot_speed*dTime;

    // if moving, apply to an arc; dH is arc angle
    if(initial.direction) {
      // invert turning when going backwards (more intuitive)
      deltas.dH *= initial.direction;
      var radius = initial.speed/initial.rot_speed;
      var l = Math.PI/2-initial.heading-deltas.dH;
      deltas.dX = radius * (Math.cos(l) - sinH);
      deltas.dY = radius * (cosH - Math.sin(l));
    }
  } else {
    var disp = initial.direction*initial.speed*dTime;
    deltas.dX = disp*cosH;
    deltas.dY = disp*sinH;
  }

  return deltas;
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