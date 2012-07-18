var KeyCodes = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,

  isArrow: function(keyCode) {
    return keyCode >= 37 && keyCode <= 40;
  }
};

var WW3 = function(display) {

  this.display = display;

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

  ROTATE_DELTA: 0.025,
  ROTATE_FREQUENCY: 100,
  REDRAW_FREQUENCY: 25,

  player: function(player) {
    return this.players[this._playerId];
  },

  width: function() {
    return this.display.canvas.width;
  },

  height: function() {
    return this.display.canvas.height;
  },

  _addPlayer: function(player) {
    this.players[player.id] = player;
    player._li = $('<li></li>').get();
    $(this.display.players).append(player._li);
    this._refreshPlayer(player);
  },

  _removePlayer: function(player) {
    delete this.players[player.id];
    $(player._li).remove();
  },

  _refreshPlayer: function(player) {
    $(player._li).text(
      player.id+' ('+player.x+', '+player.y+') @ '+
      (Math.round(player.heading*10)/10)+', lat '+Math.round(player.latency*1000)+' ms'
    );
  },

  _opened: function() {
    var self = this;

    this._gamz.act('self', [], function(me) {
      self._playerId = me.i;
    });

    this._gamz.act('info', [], function(width, height, players) {
      self.display.canvas.width = width;
      self.display.canvas.height = height;

      self.players = {};
      for(var i = 0; i < players.length; i++) {
        self._addPlayer(new WW3Player(players[i]));
      }
    });

    self.display.canvas.onkeydown = function(e) {
      if(KeyCodes.isArrow(e.keyCode) && !self._keys[e.keyCode]) {
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
        } else {
          self._computeHeading();
        }
      }
    };

    self.display.canvas.onkeyup = function(e) {
      if(KeyCodes.isArrow(e.keyCode) && self._keys[e.keyCode]) {
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

    var redraw;
    redraw = function() {
      self._redraw();
      setTimeout(redraw, self.REDRAW_FREQUENCY);
    };
    redraw();
  },

  // computes new heading periodically while left/right is pressed
  _computeHeading: function() {
    var player = this.player();

    if(this._keys[KeyCodes.LEFT] || this._keys[KeyCodes.RIGHT]) {
      if(this._keys[KeyCodes.LEFT]) {
        if(!this._keys[KeyCodes.RIGHT]) {
          // adjust it before receive a response so that subsequent headings are
          // added to THIS one (results in uniform rotation)
          player.heading = WW3.mod(player.heading-this.ROTATE_DELTA, 1.0);
          this._gamz.act('heading', player.heading);
        } else {
          // both pressed-- maintain heading
        }
      } else {
        player.heading = WW3.mod(player.heading+this.ROTATE_DELTA, 1.0);
        this._gamz.act('heading', player.heading);
      }
      var self = this;
      setTimeout(function() {
        self._computeHeading();
      }, this.ROTATE_FREQUENCY);
    }
  },

  _redraw: function() {
    if(self._playerId === null || self.players === null) {
      // only draw if loaded
      return;
    }

    var ctx = this.display.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.display.canvas.width, this.display.canvas.height);

    ctx.fillStyle = 'black';
    for(var id in this.players) {
      var predicted = this._predict(this.players[id]);
      ctx.fillRect(predicted.x-3, predicted.y-3, 7, 7);
      this._refreshPlayer(this.players[id]);
    }
  },

  _predict: function(player) {
    // estimate distance moved since last update
    var dist = player.speed*(new Date() - player.updated)/1000;

    // calculate x and y components of this distance
    var x = WW3.mod(player.x + Math.round(dist*Math.cos(player.heading*2*Math.PI)*player.direction), this.width());
    var y = WW3.mod(player.y + Math.round(dist*Math.sin(player.heading*2*Math.PI)*player.direction), this.height());

    return {x: x, y: y};
  },

  _notifyHandlers: {

    connect: function(player) {
      this._addPlayer(new WW3Player(player));
    },

    disconnect: function(player) {
      this._removePlayer(this.players[player.i]);
    },

    // updates player data
    data: function(data) {
      if(data.i == this._playerId) {
        // we determine our own heading, so there is no need to correct it.
        // if we did, we might get an outdated value.
        data.h = this.player().heading;
      }
      this.players[data.i].update(data);
    }

  }

};

var WW3Player = function(data) {
  this._li = null;
  this._sprite = null;

  if(typeof data != 'undefined') {
    this.update(data);
  }
};

WW3Player.prototype = {
  update: function(data) {
    this.updated = new Date();
    this.id = data.i;
    this.x = data.x;
    this.y = data.y;
    this.heading = data.h;
    this.speed = data.s;
    this.direction = data.d;
    this.latency = data.l;
  }
};