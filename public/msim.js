var KeyCodes = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  SPACE: 32,

  isArrow: function(keyCode) {
    return keyCode >= 37 && keyCode <= 40;
  }
};

var MSim = function(options) {
  if(typeof options == 'undefined') options = {};

  this.display = {
    canvas: $('<canvas class="msim-canvas" tabindex="1"></canvas>').get(0),
    players: $('<ul class="msim-players"></ul>').get(0),
    btnup: $('<button>up</button>').get(0),
    btndown: $('<button>down</button>').get(0),
    btnleft: $('<button>left</button>').get(0),
    btnright: $('<button>right</button>').get(0)
  };

  if('target' in options) {
    $(options.target).append(
      this.display.canvas,
      $('<div></div').append(this.display.btnup, this.display.btndown, this.display.btnleft, this.display.btnright),
      this.display.players
    );
    this.display.canvas.focus();
  }

  this.rot_speed = Math.PI;
  this.redraw_rate = 25;
  this.correct_speed = 20;
  this.compensate = false;

  this.players = null;
  this._playerId = null;

  this.missiles = null;

  // track the pressed state of keys
  this._keys = {};
  this._keys[KeyCodes.LEFT] = this._keys[KeyCodes.RIGHT] = 
    this._keys[KeyCodes.UP] = this._keys[KeyCodes.DOWN] = false;

  this._gamz = new GamzClient();

  var msim = this;

  this._gamz.onnotify = function(id) {
    msim._notifyHandlers[id].apply(msim, Array.prototype.slice.call(arguments, 1));
  };

  this._gamz.onopen = function() {
    msim._opened();
  };

  this._gamz.open({resource: '/gamz', secure: true});
};

// fix for JS's modulus of negative numbers
MSim.mod = function(a, b) {
  return ((a%b)+b)%b;
};

MSim.graduate = function(value, maxDelta) {
  var abs = Math.abs(value);
  if(abs > maxDelta) {
    return maxDelta*Math.round(value/abs);
  } else {
    return value;
  }
};

MSim.prototype = {

  player: function() {
    return this.players[this._playerId];
  },

  latency: function() {
    return this.player().latency;
  },

  delay: function() {
    return this.latency()/2.0;
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

  _addMissile: function(missile) {
    this.missiles[missile.id] = missile;
  },

  _removeMissile: function(missile) {
    delete this.missiles[missile.id];
  },

  _opened: function() {
    var msim = this;

    this._gamz.act('info', [], function(width, height, players, playerId, missiles) {
      msim.display.canvas.width = width;
      msim.display.canvas.height = height;
      msim._playerId = playerId;

      msim.players = {};
      for(var i = 0; i < players.length; i++) {
        msim._addPlayer(new MSimPlayer(msim, players[i]));
      }

      msim.missiles = {};
      for(var i = 0; i < missiles.length; i++) {
        msim._addMissile(new MSimMissile(msim, missiles[i]))
      }
    });

    msim.display.canvas.onkeypress = function(e) {
      if(e.keyCode == KeyCodes.SPACE) {
        e.preventDefault();
        msim._fire();
      }
    };

    msim.display.canvas.onkeydown = function(e) {
      if(KeyCodes.isArrow(e.keyCode)) {
        e.preventDefault();

        // some browsers fire keydown for each "press"-- we only want the first, so
        // we need to keep track of which keys are down
        if(!msim._keys[e.keyCode]) {
          msim._keys[e.keyCode] = true;

          if(e.keyCode == KeyCodes.UP) {
            msim._set('direction', msim._keys[KeyCodes.DOWN] ? 0 : 1);
          } else if(e.keyCode == KeyCodes.DOWN) {
            msim._set('direction', msim._keys[KeyCodes.UP] ? 0 : -1);
          } else if(e.keyCode == KeyCodes.LEFT) {
            msim._rotate(msim._keys[KeyCodes.RIGHT] ? 0 : -1);
          } else {
            msim._rotate(msim._keys[KeyCodes.LEFT] ? 0 : 1);
          }
        }
      }
    };

    msim.display.canvas.onkeyup = function(e) {
      if(KeyCodes.isArrow(e.keyCode)) {
        e.preventDefault();
        
        if(msim._keys[e.keyCode]) {
          msim._keys[e.keyCode] = false;

          if(e.keyCode == KeyCodes.UP) {
            msim._set('direction', msim._keys[KeyCodes.DOWN] ? -1 : 0);
          } else if(e.keyCode == KeyCodes.DOWN) {
            msim._set('direction', msim._keys[KeyCodes.UP] ? 1 : 0);
          } else if(e.keyCode == KeyCodes.LEFT) {
            msim._rotate(msim._keys[KeyCodes.RIGHT] ? 1 : 0);
          } else {
            msim._rotate(msim._keys[KeyCodes.LEFT] ? -1 : 0);
          }
        }
      }
    };

    msim.display.btnup.onclick = function() {
      msim._set('direction', msim.player().direction == 1 ? 0 : 1);
    };

    msim.display.btndown.onclick = function() {
      msim._set('direction', msim.player().direction == -1 ? 0 : -1);
    };

    msim.display.btnleft.onclick = function() {
      msim._set('heading', MSim.mod(msim.player().h-0.25*Math.PI, 2*Math.PI));
    };

    msim.display.btnright.onclick = function() {
      msim._set('heading', MSim.mod(msim.player().h+0.25*Math.PI, 2*Math.PI));
    };

    var redraw;
    (redraw = function () {
      msim._redraw();
      setTimeout(redraw, msim.redraw_rate);
    })();
  },

  // set an attribute for the current player, sending the action to the server
  _set: function(attr, value) {
    var player = this.player();
    player.update(attr, value);

    // for error correction, use the values from BEFORE the request was sent to
    // approximately cancel latency
    var bench = player.bench = {x: player.x, y: player.y, h: player.h};

    this._gamz.act(attr, [value], function(real) {
      player.latency = real.latency;
      if(bench == player.bench) {
        player.setError(
          real.x - bench.x,
          real.y - bench.y,
          real.h - bench.h
        );
        player.bench = null;
      }
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

  _fire: function() {
    this._gamz.act('fire');
  },

  _redraw: function() {
    // only draw if loaded
    if(this._playerId === null) return;

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.display.canvas.width, this.display.canvas.height);

    // draw players
    for(var id in this.players) {
      ctx.fillStyle = id == this._playerId ? 'blue' : 'black';

      var player = this.players[id];
      player.extrapolate();
      player.correct(this.correct_speed || player.speed || MSim.DEFAULT_CORRECT_SPEED);
      player.refresh();
      this._drawPlayer(ctx, player);
    }

    // draw missiles
    for(var id in this.missiles) {
      ctx.fillStyle = 'red';

      var missile = this.missiles[id];
      missile.extrapolate();
      this._drawMissile(ctx, missile);
    }
  },

  _drawPlayer: function(ctx, player) {
    var h = player.h;
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

  _drawMissile: function(ctx, missile) {
    var x = Math.round(missile.x);
    var y = Math.round(missile.y);

    ctx.beginPath();
    ctx.arc(x, y, missile.r, 0, 2*Math.PI);
    ctx.closePath();
    ctx.fill();
  },

  _notifyHandlers: {

    connect: function(data) {
      this._addPlayer(new MSimPlayer(this, data));
    },

    disconnect: function(player) {
      player = this.players[player.id];
      for(var id in this.missiles) {
        var m = this.missiles[id];
        if(m.playerId == player.id) {
          this._removeMissile(m);
        }
      }
      this._removePlayer(player);
    },

    // updates player data
    data: function(datas) {
      if(!(datas instanceof Array)) {
        datas = [datas];
      }

      for(var i = 0; i < datas.length; i++) {
        var data = datas[i];
        var player = this.players[data.id];

        if(player.id == this._playerId) {
          player.latency = data.latency;
        } else {
          player.interpolate(data, this.compensate ? this.delay() : 0);
          delete data.x;
          delete data.y;
          delete data.h;
          this.players[data.id].update(data);
        }
      }
    },

    missile: function(data) {
      this._addMissile(new MSimMissile(this, data));
    },

    explosion: function(missileId, hitPlayerIds) {
      var missile = this.missiles[missileId];
      if(this.players[missile.playerId]) {
        this.players[missile.playerId].score += hitPlayerIds.length;
      }
      for(var i = 0; i < hitPlayerIds.length; i++) {
        this.players[hitPlayerIds[i]].score--;
      }
      this._removeMissile(missile);
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
    // when not rotating, heading differences are reflected immediately, NOT
    // through error correction. this prevents inaccurate extrapolation.
    if(this.rot_speed == 0) {
      this.h = MSim.mod(this.h + h, 2*Math.PI);
      h = 0;
    }

    // rotate in whichever direction is closest to the correct heading
    if(h > Math.PI) {
      h -= 2*Math.PI;
    } else if(h < -Math.PI) {
      h += 2*Math.PI;
    }

    if(x != 0 || y != 0 || h != 0) {
      this._error = {x: x, y: y, h: h, rot_speed: Math.abs(this.rot_speed)};
      this._corrected = new Date();
    } else {
      this._error = this._corrected = null;
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
      MSim.mod(data.h + remote.dH, 2*Math.PI) - this.h
    );

    return this;
  },

  correct: function(speed) {
    if(this._error) {
      var now = new Date();
      var dTime = (now - this._corrected)/1000;

      if(this._error.x || this._error.y) {
        var factor = Math.abs(this._error.x)/(Math.abs(this._error.x)+Math.abs(this._error.y));

        var disp = speed*dTime;
        var dx = MSim.graduate(this._error.x, factor*disp);
        var dy = MSim.graduate(this._error.y, (1-factor)*disp);

        this.x = this.game.xPos(this.x + dx);
        this._error.x -= dx;

        this.y = this.game.yPos(this.y + dy);
        this._error.y -= dy;
      }

      if(this._error.h) {
        var dh = MSim.graduate(this._error.h, this._error.rot_speed*dTime);
        this.h = MSim.mod(this.h + dh, 2*Math.PI);
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
    this.y = this.game.yPos(this.y + delta.dY);
    this.h = MSim.mod(this.h + delta.dH, 2*Math.PI);
    this._updated = now;
   
    return this;
  },

  refresh: function() {
    if(this._li) {
      $(this._li).text(
        '#'+this.id+' score '+this.score+' ('+Math.round(this.x)+', '+Math.round(this.y)+') rot '+
        (Math.round(this.h*10)/10)+' rad @ '+
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

  var sinH = Math.sin(initial.h);
  var cosH = Math.cos(initial.h);

  if(initial.rot_speed != 0.0) {
    delta.dH = initial.rot_speed*dTime;

    // if moving, apply to an arc; dH is arc angle
    if(initial.direction) {
      delta.dH *= initial.direction; // invert turning when moving backwards
      var radius = initial.speed/initial.rot_speed;
      var l = Math.PI/2-initial.h-delta.dH;
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

var MSimMissile = function(game, data) {
  this.game = game;

  for(var attr in data) {
    this[attr] = data[attr];
  }

  this._updated = new Date();
};

MSimMissile.extrapolate = function(initial, dTime) {
  var disp = initial.speed*dTime;
  return {dX: disp*Math.cos(initial.h), dY: disp*Math.sin(initial.h)};
};

MSimMissile.prototype = {

  player: function() {
    this.game.players[this.playerId];
  },

  extrapolate: function() {
    var now = new Date();
    var delta = MSimMissile.extrapolate(this, (now - this._updated)/1000);
    
    this.x = MSim.mod(this.x + delta.dX, this.game.width());
    this.y = MSim.mod(this.y + delta.dY, this.game.height());
    this._updated = now;
   
    return this;
  }

};