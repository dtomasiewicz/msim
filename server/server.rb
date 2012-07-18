#!/usr/bin/env ruby
require 'gamz/server'

class Avatar

  attr_reader :client, :direction, :x, :y, :heading, :speed
  attr_accessor :latency

  def initialize(world, id)
    @world = world
    @id = id
    @direction = 0
    @x, @y = 0, 0
    @heading = 0.0 # radians/(2pi) .. [0.0, 1.0)
    @speed = 100 # per second
  end

  def forward!
    compute!
    @direction = 1
    @move_start = Time.now
  end

  def backward!
    compute!
    @direction = -1
    @move_start = Time.now
  end

  def stop!
    compute! true
    @direction = 0
  end

  def heading=(heading)
    compute!
    @heading = heading
  end

  def data
    {i: @id, x: @x, y: @y, h: @heading, s: @speed, d: @direction, l: @latency}
  end

  private

  # computes the current coordinates
  def compute!(stop = false)
    if @move_start
      now = Time.now
      dist = speed*(now - @move_start)
      @x = (@x + (dist*Math.cos(heading*2*Math::PI)*direction).round) % @world.width
      @y = (@y + (dist*Math.sin(heading*2*Math::PI)*direction).round) % @world.height
      @move_start = stop ? nil : now
    end
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

  def react_self(avatar)
    [:success, avatar.data]
  end

  def react_info(avatar)
    [:success, @width, @height, @avatars.values.map(&:data)]
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
    # avatars always know their own heading
    notify_except avatar, :data, avatar.data
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

world = World.new 400, 300
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
server.start
