#!/usr/bin/env ruby
require 'gamz/server'

class Avatar

  attr_reader :world, :id, :client, :direction, :x, :y, :h, :speed, :rot_speed
  attr_accessor :latency

  def initialize(world, id)
    @world = world
    @id = id
    @direction = 0
    @x, @y = 0.0, 0.0
    @h = 0.0 # radians
    @rot_speed = 0.0
    @speed = 200 # per second
    @updated = Time.now
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
    instant.merge! i: @id, d: @direction, s: @speed, r: @rot_speed, l: @latency
  end

  # computes the coordinates/heading at the given time
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
  def compute!(time = Time.now)
    d = instant time
    @x, @y, @h, @updated = d[:x], d[:y], d[:h], time
  end

end

class Missile

  attr_reader :avatar, :x, :y, :h, :speed

  def initialize(avatar, id, speed)
    avatar.compute!
    @avatar = avatar
    @id = id
    @x = avatar.x
    @y = avatar.y
    @h = avatar.h
    @speed = speed
    @updated = Time.now
  end

  def data
    compute!
    {i: @id, a: @avatar.id, x: @x, y: @y, s: @speed, h: @h}
  end

  def instant(time = Time.now)
    elapsed = time-@updated

    dx = dy = 0.0
    sin_h, cos_h = Math.sin(@h), Math.cos(@h)

    disp = @direction*@speed*elapsed
    dx = disp*cos_h;
    dy = disp*sin_h;

    {x: @avatar.world.x_coord(@x+dx), y: @avatar.world.y_coord(@y+dy)}
  end

end

class World

  include Gamz::Server::Reactor

  attr_reader :width, :height, :clients, :avatars

  def initialize(width, height)
    @width, @height = width, height
    @avatars = {}
    @clients = {}
    @last_id = 0
  end

  def x_coord(value)
    (value > width ? width : (value < 0 ? 0 : value)).to_f
  end

  def y_coord(value)
    (value > height ? height : (value < 0 ? 0 : value)).to_f
  end

  def notify_all(*args)
    @clients.each_value do |client|
      client.notify *args
    end
  end

  def notify_except(avatar, *args)
    except = @clients[avatar]
    @clients.each_value do |client|
      client.notify *args unless client == except
    end
  end

  def on_connect(client)
    a = @avatars[client] = Avatar.new(self, @last_id += 1)
    @clients[a] = client
    notify_except a, :connect, a.data
  end

  def on_disconnect(client)
    if a = @avatars.delete(client)
      @clients.delete a
      notify_except a, :disconnect, a.data
    end
  end

  def map_client(client)
    @avatars[client]
  end

  def broadcast_state
    notify_all :data, @avatars.values.map(&:data)
  end

  def react_info(avatar)
    [:success, @width, @height, @avatars.values.map(&:data), avatar.id]
  end

  def react_direction(avatar, direction)
    avatar.direction = direction.to_i
    notify_except avatar, :data, avatar.data
    [:success, avatar.data]
  end

  def react_rot_speed(avatar, rot_speed)
    avatar.rot_speed = rot_speed.to_f
    notify_except avatar, :data, avatar.data
    [:success, avatar.data]
  end

  def react_heading(avatar, heading)
    avatar.h = heading.to_f
    notify_except avatar, :data, avatar.data
    [:success, avatar.data]
  end

  def react_fire(avatar)

  end

  private

  # returns an array of all avatars within the given radius of
  # the given point. pythagorean theorem on all avatars.
  def in_radius(x, y, radius)
    @avatars.values.select do |avatar|
      Math.hypot(avatar.x-x, avatar.y-y) <= radius
    end
  end

  def notify_all(action = :info, *details)
    @clients.each_value do |client|
      client.notify action, *details
    end
  end

end

world = World.new 640, 480
server = Gamz::Server.new world
server.listen 10000
server.listen_ws 10001
server.each_seconds 3, preemptive: false do
  world.avatars.each_pair do |client, avatar|
    start = Time.now
    client.ping do
      avatar.latency = Time.now-start
    end
  end
end
#server.each_ticks 10 do
#  world.broadcast_state
#end
server.start
