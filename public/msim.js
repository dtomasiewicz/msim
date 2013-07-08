var KeyCodes = {
  //arrow keys
  //LEFT: 37,
  //UP: 38,
  //RIGHT: 39,
  //DOWN: 40,
  UP: 87,
  LEFT: 65,
  DOWN: 83,
  RIGHT: 68,
  LSTRAFE: 81,
  RSTRAFE: 69,
  FIRE: 32,
  ESC: 27
};

var MSim = function(options) {
  if(typeof options == 'undefined') options = {};

  this.display = {
    canvas: $('<canvas class="msim-canvas" tabindex="1"></canvas>').get(0),
    players: $('<ul class="msim-players"></ul>').get(0),
    btnup: $('<button>up</button>').get(0),
    btndown: $('<button>down</button>').get(0),
    btnleft: $('<button>left</button>').get(0),
    btnright: $('<button>right</button>').get(0),
    btnfire: $('<button>fire</button>').get(0)
  };

  if('target' in options) {
    $(options.target).append(
      this.display.canvas,
      $('<div></div').append(
        this.display.btnup, this.display.btndown, this.display.btnleft,
        this.display.btnright, this.display.btnfire),
      this.display.players
    );
    this.display.canvas.focus();
  }

  this.rot_speed = Math.PI;
  this.redraw_rate = 25;
  this.fire_rate = 100;
  this.correct_speed = 20;
  this.compensate = false;

  this.players = null;
  this._playerId = null;

  this.missiles = null;

  // track the pressed state of keys
  this._keys = {};
  for(var key in KeyCodes) {
    this._keys[KeyCodes[key]] = false;
  }

  this._firing = false;

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
      player._li.style.color = 'darkgreen';
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

    this._gamz.act('state', [], function(width, height, players, playerId, missiles) {
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

    msim.display.canvas.onkeydown = function(e) {
      if(e.keyCode != KeyCodes.ESC) {
        e.preventDefault();

        // some browsers fire keydown for each "press"-- we only want the first, so
        // we need to keep track of which keys are down
        if(!msim._keys[e.keyCode]) {
          msim._keys[e.keyCode] = true;

          switch(e.keyCode) {
            case KeyCodes.UP:
            case KeyCodes.DOWN:
            case KeyCodes.LSTRAFE:
            case KeyCodes.RSTRAFE:
              msim._computeMovement();
              break;
            case KeyCodes.LEFT:
            case KeyCodes.RIGHT:
              msim._computeRotation();
              break;
            case KeyCodes.FIRE:
              msim._firing = true;
              msim._rapidFire();
              break;
          }
        }
      }
    };

    msim.display.canvas.onkeyup = function(e) {
      if(e.keyCode != KeyCodes.ESC) {
        e.preventDefault();
        
        if(msim._keys[e.keyCode]) {
          msim._keys[e.keyCode] = false;

          switch(e.keyCode) {
            case KeyCodes.UP:
            case KeyCodes.DOWN:
            case KeyCodes.LSTRAFE:
            case KeyCodes.RSTRAFE:
              msim._computeMovement();
              break;
            case KeyCodes.LEFT:
            case KeyCodes.RIGHT:
              msim._computeRotation();
              break;
            case KeyCodes.FIRE:
              msim._firing = false;
              break;
          }
        }
      }
    };

    msim.display.btnup.onclick = function() {
      msim._set('d', 0);
      msim._set('m', msim.player().m == 1 ? 0 : 1);
    };

    msim.display.btndown.onclick = function() {
      msim._set('d', Math.PI);
      msim._set('m', msim.player().m == 1 ? 0 : 1);
    };

    msim.display.btnleft.onclick = function() {
      msim._set('h', MSim.mod(msim.player().h-0.25*Math.PI, 2*Math.PI));
    };

    msim.display.btnright.onclick = function() {
      msim._set('h', MSim.mod(msim.player().h+0.25*Math.PI, 2*Math.PI));
    };

    msim.display.btnfire.onclick = function() {
      msim._fire();
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

  _computeMovement: function() {
    var up = this._keys[KeyCodes.UP], down = this._keys[KeyCodes.DOWN],
      ls = this._keys[KeyCodes.LSTRAFE], rs = this._keys[KeyCodes.RSTRAFE];

    var dir, mot;
    if(up && !down || down && !up) {
      mot = 1;
      if(ls && !rs || rs && !ls) {
        if(up) {
          dir = rs ? Math.PI/4 : -Math.PI/4;
        } else {
          dir = rs ? 3*Math.PI/4 : -3*Math.PI/4;
        }
      } else {
        dir = up ? 0 : Math.PI;
      }
    } else {
      if(ls && rs) {
        mot = 0;
        dir = null;
      } else if(ls || rs) {
        mot = 1;
        dir = rs ? Math.PI/2 : -Math.PI/2;
      } else {
        mot = 0;
        dir = null;
      }
    }

    if(dir !== null) {
      this._set('d', dir);
    }
    this._set('m', mot);
  },

  _computeRotation: function() {
    var l = this._keys[KeyCodes.LEFT], r = this._keys[KeyCodes.RIGHT];

    if(l && !r || r && !l) {
      // invert rotation when moving backwards
      var invert = this._keys[KeyCodes.DOWN] && !this._keys[KeyCodes.UP] ? -1 : 1;
      this._set('rot_speed', invert*this.rot_speed*(l ? -1 : 1));
    } else {
      this._set('rot_speed', 0);
    }
  },

  _fire: function() {
    this._gamz.act('fire');
  },

  _rapidFire: function() {
    var msim = this;
    if(msim._firing) {
      msim._fire();
      setTimeout(function() {
        msim._rapidFire();
      }, msim.fire_rate);
    }
  },

  _redraw: function() {
    // only draw if loaded
    if(this._playerId === null) return;

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.width(), this.height());

    // draw missiles
    for(var id in this.missiles) {
      var missile = this.missiles[id];
      missile.extrapolate();
      this._drawMissile(ctx, missile);
    }

    // draw other players
    for(var id in this.players) {
      var player = this.players[id];
      player.extrapolate();
      player.correct(this.correct_speed || player.speed || MSim.DEFAULT_CORRECT_SPEED);
      player.refresh();
      if(player.id != this._playerId) {
        this._drawPlayer(ctx, player);
      }
    }

    // draw ourself on top
    this._drawPlayer(ctx, this.player());
  },

  _drawPlayer: function(ctx, player) {
    var h = player.h;
    var x = Math.round(player.x);
    var y = Math.round(player.y);

    var point = 1.5*player.r;

    ctx.fillStyle = player.id == this._playerId ? 'darkgreen' : 'black';
    ctx.beginPath();
    // semi-circle
    ctx.arc(x, y, player.r, h + 0.2*Math.PI, h - 0.2*Math.PI);
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

    ctx.fillStyle = missile.playerId == this._playerId ? 'darkgreen' : 'red';
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

    hit: function(missileId, hitPlayerIds) {
      var missile = this.missiles[missileId];
      this.players[missile.playerId].score += hitPlayerIds.length;
      //for(var i = 0; i < hitPlayerIds.length; i++) {
      //  this.players[hitPlayerIds[i]].score--;
      //}
      this._removeMissile(missile);
      //console.log(Object.keys(this.missiles).length, 'missiles remaining');
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
      $(this._li).html(
        'P'+this.id+' score <strong>'+this.score+'</strong> ('+
        Math.round(this.x)+', '+Math.round(this.y)+') rot '+
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
MSimPlayer.extrapolate = function(initial, dTime) {
  var delta = {
    dX: 0.0,
    dY: 0.0,
    dH: 0.0
  };

  var sinH = Math.sin(initial.h+initial.d);
  var cosH = Math.cos(initial.h+initial.d);

  if(initial.rot_speed != 0.0) {
    delta.dH = initial.rot_speed*dTime;

    // if moving, apply to an arc; dH is arc angle
    if(initial.m) {
      var radius = initial.speed/initial.rot_speed;
      var l = Math.PI/2-(initial.h+initial.d)-delta.dH;
      delta.dX = radius * (Math.cos(l) - sinH);
      delta.dY = radius * (cosH - Math.sin(l));
    }
  } else {
    var disp = initial.m*initial.speed*dTime;
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
    
    this.x += delta.dX;
    this.y += delta.dY;
    this._updated = now;
   
    return this;
  }

};