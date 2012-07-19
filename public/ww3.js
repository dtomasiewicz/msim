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

  ROTATE_DELTA: 0.05,
  ROTATE_FREQUENCY: 100,
  REDRAW_FREQUENCY: 25,

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
    player.refresh();
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
        self._addPlayer(new WW3Player(self._translateData(players[i])));
      }
    });

    self.display.canvas.onkeydown = function(e) {
      if(KeyCodes.isArrow(e.keyCode)) {
        e.preventDefault();

        if(!self._keys[e.keyCode]) {
          self._keys[e.keyCode] = true;

          // some browsers fire keydown for each "press"-- we only want the first
          if(e.keyCode == KeyCodes.UP) {
            if(self._keys[KeyCodes.DOWN]) {
              self._gamz.act('stop');
            } else {
              self._gamz.act('forward');
            }
          } else if(e.keyCode == KeyCodes.DOWN) {
            if(self._keys[KeyCodes.UP]) {
              self._gamz.act('stop');
            } else {
              self._gamz.act('backward');
            }
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
              self._gamz.act('backward');
            } else {
              self._gamz.act('stop');
            }
          } else if(e.keyCode == KeyCodes.DOWN) {
            if(self._keys[KeyCodes.UP]) {
              self._gamz.act('forward');
            } else {
              self._gamz.act('stop');
            }
          }
        }
      }
    }

    var redraw;
    (redraw = function () {
      self._redraw();
      setTimeout(redraw, self.REDRAW_FREQUENCY);
    })();

    var ch;
    (ch = function() {
      self._computeHeading();
      setTimeout(ch, self.ROTATE_FREQUENCY);
    })();
  },

  // computes new heading periodically while left/right is pressed
  _computeHeading: function() {
    if(this._keys[KeyCodes.LEFT] || this._keys[KeyCodes.RIGHT]) {
      var player = this.player();
      // invert turning while backing up
      var direction = player.get('direction') == -1 ? -1 : 1;
      if(this._keys[KeyCodes.LEFT]) {
        if(!this._keys[KeyCodes.RIGHT]) {
          // adjust it before receive a response so that subsequent headings are
          // added to THIS one (results in uniform rotation)
          this._predict(this.player());
          player.set('heading', WW3.mod(player.get('heading')-this.ROTATE_DELTA*direction, 1.0));
          this._gamz.act('heading', player.get('heading'));
        } else {
          // both pressed-- maintain heading
        }
      } else {
        this._predict(this.player());
        player.set('heading', WW3.mod(player.get('heading')+this.ROTATE_DELTA*direction, 1.0));
        this._gamz.act('heading', player.get('heading'));
      }
    }
  },

  _redraw: function() {
    // only draw if loaded
    if(this._playerId === null) return;

    var predictor = this._predictor();

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.display.canvas.width, this.display.canvas.height);

    ctx.fillStyle = 'black';
    for(var id in this.players) {
      ctx.fillStyle = id == this._playerId ? 'blue' : 'black';
      predictor.call(this, this.players[id])
      this._drawPlayer(ctx, this.players[id]);
    }
  },

  _drawPlayer: function(ctx, player) {
    // floor so that we always get a value on the canvas
    var h = player.get('heading')*2*Math.PI;

    // TODO constants/options?
    var radius = 5;
    var point = 10;

    ctx.beginPath();
    // semi-circle
    ctx.arc(Math.floor(player.get('x')), Math.floor(player.get('y')), radius, h + 0.5*Math.PI, h - 0.5*Math.PI);
    // first side of the point
    var x_ = Math.cos(2*Math.PI - h)*point;
    var y_ = Math.sin(2*Math.PI - h)*point;
    ctx.lineTo(Math.floor(player.get('x') + x_), Math.floor(player.get('y') - y_));
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

  _predict_extrapolate: function(player) {
    // extrapolate distance travelled since last update
    var disp = player.get('direction')*player.get('speed')*(new Date() - player.get('updated'))/1000;

    player._predicted = {
      x: WW3.mod(player.get('x') + disp*Math.cos(player.get('heading')*2*Math.PI), this.width()),
      y: WW3.mod(player.get('y') + disp*Math.sin(player.get('heading')*2*Math.PI), this.height()),
      updated: new Date()
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
    if('h' in wire) data.heading = wire.h;
    if('s' in wire) data.speed = wire.s;
    if('d' in wire) data.direction = wire.d;
    if('l' in wire) data.latency = wire.l;
    return data;
  },

  _notifyHandlers: {

    connect: function(player) {
      this._addPlayer(new WW3Player(this._translateData(player)));
    },

    disconnect: function(player) {
      this._removePlayer(this.players[player.i]);
    },

    // updates player data
    data: function(data) {
      data = this._translateData(data);
      if(data.id == this._playerId) {
        delete data.heading;
      }
      this.players[data.id].update(data);
      this.players[data.id].refresh();
    }

  }

};

var WW3Player = function(data) {
  this._real = {};
  this._predicted = {};
  this._li = null;

  if(typeof data == 'object') {
    this.update(data);
  }
};

WW3Player.prototype = {

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
        this.get('id')+' ('+this.get('x')+', '+this.get('y')+') @ '+
        (Math.round(this.get('heading')*10)/10)+', lat '+Math.round(this.get('latency')*1000)+' ms'
      );
    }
  }

};