var KeyCodes = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,

  isArrow: function(keyCode) {
    return keyCode >= 37 && keyCode <= 40;
  }
};

var MSim = function(options) {
  if(typeof options == 'undefined') options = {};

  this.display = {
    canvas: $('<canvas class="msim-canvas" tabindex="1"></canvas>').get(0),
    players: $('<ul class="msim-players"></ul>').get(0)
  };

  if('target' in options) {
    $(options.target).append(this.display.canvas, this.display.players);
    this.display.canvas.focus();
  }

  this.rot_speed = Math.PI;
  this.redraw_rate = 25;
  this.correct_speed = 200;
  this.correct_rot_speed = Math.PI;
  this.compensate = false;

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

MSim.DEFAULT_CORRECT_SPEED = 200;
MSim.DEFAULT_CORRECT_ROT_SPEED = Math.PI;

// fix for JS's modulus of negative numbers
MSim.mod = function(a, b) {
  return ((a%b)+b)%b;
};

MSim.graduate = function(value, delta) {
  var aValue = Math.abs(value);
  if(aValue > delta) {
    return delta*Math.round(value/aValue);
  } else {
    return value;
  }
};

MSim.prototype = {

  player: function() {
    return this.players[this._playerId];
  },

  delay: function() {
    return this.player().latency/2.0;
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
        var data = MSimPlayer.normalizeData(players[i]);
        self._addPlayer(new MSimPlayer(self, data));
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

  _set: function(attr, value) {
    var player = this.player();
    player.update(attr, value);
    var bench = {x: player.x, y: player.y, h: player.heading};
    this._gamz.act(attr, [value], function(real) {
      real = MSimPlayer.normalizeData(real);
      console.log('real x = '+real.x);
      console.log('bench x = '+bench.x);
      player.setError(
        real.x - bench.x,
        real.y - bench.y,
        real.heading - bench.h
      );
    });
  },

  _backward: function() {
    this._set('direction', -1);
  },

  _forward: function() {
    this._set('direction', 1);
  },

  _stop: function() {
    this._set('direction', 0);
  },

  // direction: 1=CCW, -1=CW, 0=none
  _rotate: function(direction) {
    this._set('rot_speed', direction*this.rot_speed);
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
      player.extrapolate();
      
      player.correct(
        this.correct_speed || player.speed || MSim.DEFAULT_CORRECT_SPEED,
        this.correct_rot_speed || player.rot_speed || MSim.DEFAULT_CORRECT_ROT_SPEED
      );

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
      data = MSimPlayer.normalizeData(data);
      this._addPlayer(new MSimPlayer(this, data));
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
        var data = MSimPlayer.normalizeData(datas[i]);
        var player = this.players[data.id];

        if(player.id == this._playerId) {
          player.latency = data.latency;
        } else {
          player.interpolate(data, this.compensate ? this.latency() : 0);
          delete data.x;
          delete data.y;
          delete data.heading;
          this.players[data.id].update(data);
        }
      }
    }

  }

};

var MSimPlayer = function(game, data) {
  this.game = game;

  for(var attr in data) {
    this[attr] = data[attr];
  }

  this._updated = new Date();
  this._error = null;
  this._li = null;
};

MSimPlayer.prototype = {

  update: function(attr, value) {
    this.extrapolate();

    if(typeof attr == 'object') {
      for(var a in attr) {
        this[a] = attr[a];
      }
    } else {
      this[attr] = value;
    }
  },

  setError: function(x, y, h) {
    // rotate in whichever direction is closest to the correct heading
    if(h > Math.PI) {
      h -= 2*Math.PI;
    } else if(h < -Math.PI) {
      h += 2*Math.PI;
    }

    if(x || y || h) {
      this._error = {x: x, y: y, h: h};
      console.log('set error x = '+this._error.x);
      this._corrected = new Date();
    } else {
      console.log('no errors');
    }
  },
  
  // if a latency is provided, will extrapolate a new current based on it.
  // this may make complex movement look jerky, but will provide more accurate
  // positions for simpler movement patterns.
  interpolate: function(data, latency) {
    this.extrapolate();

    var remote = latency ? MSimPlayer.extrapolate(data, latency) : {dX: 0, dY: 0, dH: 0};
    
    this.setError(
      this.game.xPos(data.x + remote.dX) - this.game.xPos(this.x),
      this.game.yPos(data.y + remote.dY) - this.game.yPos(this.y),
      MSim.mod(data.heading + remote.dH, 2*Math.PI) - this.heading
    );

    return this;
  },

  correct: function(speed, rot_speed) {
    if(this._error) {
      var now = new Date();
      var dTime = (now - this._corrected)/1000;

      if(this._error.x || this._error.y) {
        var factor = Math.abs(this._error.x)/(Math.abs(this._error.x)+Math.abs(this._error.y));

        var disp = speed*dTime;
        var dx = MSim.graduate(this._error.x, factor*disp);
        console.log('correct dx = '+dx)
        var dy = MSim.graduate(this._error.y, (1-factor)*disp);

        this.x = this.game.xPos(this.x + dx);
        console.log('new x = '+this.x);
        this._error.x -= dx;
        console.log('error    x = '+this._error.x);

        this.y = this.game.yPos(this.y + dy);
        this._error.y -= dy;
      }

      if(this._error.h) {
        var dh = MSim.graduate(this._error.h, rot_speed*dTime);
        this.heading = MSim.mod(this.heading + dh, 2*Math.PI);
        this._error.h -= dh;
      }

      this._corrected = now;
    }

    return this;
  },

  extrapolate: function() {
    var now = new Date();
    var delta = MSimPlayer.extrapolate(this, (now - this._updated)/1000);

    this.x = this.game.xPos(this.x + delta.dX);
    if(delta.dX != 0) {
      console.log('(ext) new x = '+this.x);
    }
    this.y = this.game.yPos(this.y + delta.dY);
    this.heading = MSim.mod(this.heading + delta.dH, 2*Math.PI);
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
MSimPlayer.extrapolate = function(initial, dTime) {
  var delta = {
    dX: 0.0,
    dY: 0.0,
    dH: 0.0
  };

  var sinH = Math.sin(initial.heading);
  var cosH = Math.cos(initial.heading);

  if(initial.rot_speed != 0.0) {
    delta.dH = initial.rot_speed*dTime;

    // if moving, apply to an arc; dH is arc angle
    if(initial.direction) {
      delta.dH *= initial.direction; // invert turning when moving backwards
      var radius = initial.speed/initial.rot_speed;
      var l = Math.PI/2-initial.heading-delta.dH;
      delta.dX = radius * (Math.cos(l) - sinH);
      delta.dY = radius * (cosH - Math.sin(l));
    }
  } else {
    var disp = initial.direction*initial.speed*dTime;
    delta.dX = disp*cosH;
    delta.dY = disp*sinH;
  }

  return delta;
};

// data sent over the wire is in an abbreviated format; this function will
// convert it to the full format if necessary
MSimPlayer.normalizeData = function(data) {
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