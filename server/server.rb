#!/usr/bin/env ruby
require 'gamz/server'

class Avatar

  attr_reader :id, :client, :direction, :x, :y, :heading, :speed, :rot_speed
  attr_accessor :latency

  def initialize(world, id)
    @world = world
    @id = id
    @direction = 0
    @x, @y = 0, 0
    @heading = 0.0 # radians
    @rot_speed = 0.0
    @speed = 200 # per second
    @updated = Time.now
  end

  def forward!
    compute!
    @direction = 1
  end

  def backward!
    compute!
    @direction = -1
  end

  def stop!
    compute!
    @direction = 0
  end

  def heading=(heading)
    compute!
    @heading = heading
  end

  def rot_speed=(rot_speed)
    compute!
    @rot_speed = rot_speed
  end

  def data
    {i: @id, x: @x, y: @y, d: @direction, s: @speed, r: @rot_speed, h: @heading, l: @latency}
  end

  private

  # computes the current coordinates
  def compute!
    now = Time.now
    elapsed = now-@updated

    # apply to an arc if rotating
    dx = dy = dh = 0.0
    if @rot_speed != 0.0
      dh = @rot_speed*elapsed # dh = arc angle
      radius = @speed/@rot_speed
      l = Math::PI/2-@heading-dh
      dx = @direction * radius * (Math.cos(l) - Math.sin(@heading))
      dy = @direction * radius * (Math.cos(@heading) - Math.sin(l))
    else
      disp = @direction*@speed*elapsed
      dx = disp*Math.cos(@heading);
      dy = disp*Math.sin(@heading);
    end

    @x = (@x + dx) % @world.width
    @y = (@y + dy) % @world.height
    @heading = (@heading + dh) % (2*Math::PI)
    @updated = now
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

  def react_forward(avatar)
    avatar.forward!
    notify_all :data, avatar.data
    :success
  end

  def react_backward(avatar)
    avatar.backward!
    notify_all :data, avatar.data
    :success
  end

  def react_stop(avatar)
    avatar.stop!
    notify_all :data, avatar.data
    :success
  end

  def react_heading(avatar, heading)
    avatar.heading = heading.to_f % 1.0
    notify_all :data, avatar.data
    :success
  end

  def react_rotate(avatar, speed)
    avatar.rot_speed = speed.to_f
    notify_all :data, avatar.data
    :success
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

world = World.new 1000, 600
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
#server.each_ticks 100 do
#  world.broadcast_state
#end
server.start
