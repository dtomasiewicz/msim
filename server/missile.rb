class Missile

  attr_reader :player, :id, :x, :y, :h, :r, :speed

  def initialize(player, id)
    @player = player
    @id = id

    pi = player.instant(@updated = Time.now)
    @x = pi[:x]
    @y = pi[:y]
    @h = pi[:h]
    @r = 3
    @speed = player.speed*1.5
  end

  def data
    instant.merge! h: @h, r: @r, id: @id, playerId: @player.id, speed: @speed
  end

  def instant(time = Time.now)
    elapsed = time-@updated
    disp = @speed*elapsed

    {
      x: @x + disp*Math.cos(@h),
      y: @y + disp*Math.sin(@h)
    }
  end

end