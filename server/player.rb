class Player

  attr_reader :world, :id, :client, :x, :y, :d, :h, :m, :r,
    :speed, :rot_speed, :updated
  attr_accessor :rtt, :score

  def initialize(world, id)
    @updated = Time.now
    @world = world
    @id = id
    @x, @y = world.width/2, world.height/2
    @h, @d = 0.0, 0.0 # radians
    @m = 0
    @r = 8
    @rot_speed = 0.0 # rad/sec
    @speed = 200 # pix/sec
    @score = 0
  end

  def h=(heading)
    compute!
    @h = heading
  end

  def d=(direction)
    compute!
    @d = direction.to_f
  end

  def m=(motion)
    compute!
    @m = motion == 0 ? 0 : 1
  end

  def rot_speed=(rot_speed)
    compute!
    @rot_speed = rot_speed.to_f
  end

  def data
    instant.merge! r: @r, id: @id, d: @d, m: @m, speed: @speed,
      rot_speed: @rot_speed, rtt: @rtt, score: @score
  end

  # computes the coordinates/heading at the given time
  # compare to MSimPlayer.extrapolate in client code
  #   difference: client version uses deltas
  def instant(time = Time.now)
    elapsed = time-@updated

    dx = dy = dh = 0.0
    sin_h, cos_h = Math.sin(@h+@d), Math.cos(@h+@d)

    if @rot_speed != 0.0
      dh = @rot_speed*elapsed

      # if moving, apply to an arc; dh is arc angle
      if @m != 0
        radius = @speed/@rot_speed
        l = Math::PI/2-(@h+@d)-dh
        dx = radius * (Math.cos(l) - sin_h)
        dy = radius * (cos_h - Math.sin(l))
      end
    else
      disp = @m*@speed*elapsed
      dx = disp*cos_h;
      dy = disp*sin_h;
    end

    {
      x: @world.x_coord(@x+dx),
      y: @world.y_coord(@y+dy),
      h: (@h + dh) % (2*Math::PI)
    }
  end

  # compute the coordinates/heading and writes them directly
  # compare to MSimPlayer.prototype.extrapolate in client code
  def compute!(time = Time.now)
    d = instant time
    @x, @y, @h, @updated = d[:x], d[:y], d[:h], time
  end

end