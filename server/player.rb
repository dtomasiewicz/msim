class Player

  attr_reader :world, :id, :client, :direction, :x, :y, :h, :r, :speed, :rot_speed, :updated
  attr_accessor :latency, :score

  def initialize(world, id)
    @updated = Time.now
    @world = world
    @id = id
    @direction = 0
    @x, @y = world.width/2, world.height/2
    @h = 0.0 # radians
    @r = 8
    @rot_speed = 0.0
    @speed = 200 # per second
    @score = 0
  end

  def stop!
    compute!
    @direction = 0
  end

  def h=(heading)
    compute!
    @h = heading
  end

  def direction=(direction)
    compute!
    @direction = direction <=> 0
  end

  def rot_speed=(rot_speed)
    compute!
    @rot_speed = rot_speed
  end

  def data
    instant.merge! r: @r, id: @id, direction: @direction, speed: @speed,
      rot_speed: @rot_speed, latency: @latency, score: @score
  end

  # computes the coordinates/heading at the given time
  # compare to MSimPlayer.extrapolate in client code
  #   difference: client version uses deltas
  def instant(time = Time.now)
    elapsed = time-@updated

    dx = dy = dh = 0.0
    sin_h, cos_h = Math.sin(@h), Math.cos(@h)

    if @rot_speed != 0.0
      dh = @rot_speed*elapsed

      # if moving, apply to an arc; dh is arc angle
      if @direction != 0
        dh *= @direction # invert turning when moving backwards
        radius = @speed/@rot_speed
        l = Math::PI/2-@h-dh
        dx = radius * (Math.cos(l) - sin_h)
        dy = radius * (cos_h - Math.sin(l))
      end
    else
      disp = @direction*@speed*elapsed
      dx = disp*cos_h;
      dy = disp*sin_h;
    end

    {
      x: @world.x_coord(@x+dx),
      y: @world.y_coord(@y+dy),
      h: (@h + dh) % (2*Math::PI)
    }
  end

  private

  # compute the coordinates/heading and writes them directly
  # compare to MSimPlayer.prototype.extrapolate in client code
  def compute!(time = Time.now)
    d = instant time
    @x, @y, @h, @updated = d[:x], d[:y], d[:h], time
  end

end