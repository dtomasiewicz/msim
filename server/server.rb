#!/usr/bin/env ruby
require 'gamz/server'

require_relative 'player'
require_relative 'missile'

class World

  include Gamz::Server::Reactor

  attr_reader :width, :height, :clients, :players

  def initialize(width, height)
    @width, @height = width, height
    @players = {}
    @clients = {}
    @missiles = {}
    @last_id = 0
  end

  def x_coord(value)
    (value > width ? width : (value < 0 ? 0 : value)).to_f
  end

  def y_coord(value)
    (value > height ? height : (value < 0 ? 0 : value)).to_f
  end

  def on_connect(client)
    p = @players[client] = Player.new(self, @last_id += 1)
    @clients[p] = client
    notify_except p, :connect, p.data
  end

  def on_disconnect(client)
    if p = @players.delete(client)
      @clients.delete p
      @missiles.reject!{|id, m| m.player == p}
      notify_all :disconnect, p.data
    end
  end

  def map_client(client)
    @players[client]
  end

  def broadcast_state
    notify_all :data, @players.values.map(&:data)
  end

  def react_info(player)
    [:success, @width, @height, @players.values.map(&:data), player.id, @missiles.values.map(&:data)]
  end

  def react_direction(player, direction)
    player.direction = direction.to_i
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_rot_speed(player, rot_speed)
    player.rot_speed = rot_speed.to_f
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_heading(player, heading)
    player.h = heading.to_f
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_fire(player)
    m = Missile.new(player, @last_id += 1)
    @missiles[m.id] = m
    notify_all :missile, m.data
    [:success]
  end

  def hit_scan
    @missiles.each_value do |m|
      mi = m.instant
      hit = in_radius mi[:x], mi[:y], m.r
      hit.delete m.player
      if hit.any?
        hit.each{|p| p.score -= 1}
        m.player.score += hit.length if m.player
        @missiles.delete m.id
        notify_all :explosion, m.id, hit.map(&:id)
      end
    end
  end

  private

  # returns an array of all players within the given radius of
  # the given point. pythagorean theorem on all players.
  def in_radius(x, y, radius)
    @players.values.select do |player|
      Math.hypot(player.x-x, player.y-y) <= radius
    end
  end

  def notify_all(action = :info, *details)
    @clients.each_value do |client|
      client.notify action, *details
    end
  end

  def notify_except(player, *args)
    except = @clients[player]
    @clients.each_value do |client|
      client.notify *args unless client == except
    end
  end

end

world = World.new 640, 480
server = Gamz::Server.new world
server.listen 10000
server.listen_ws 10001
server.each_seconds 3, preemptive: false do
  world.players.each_pair do |client, player|
    start = Time.now
    client.ping do
      player.latency = Time.now-start
    end
  end
end
server.each_ticks 1, &world.method(:hit_scan)
server.start
