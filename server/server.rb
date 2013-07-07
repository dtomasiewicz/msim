#!/usr/bin/env ruby
require 'gamz/server'

require_relative 'player'
require_relative 'missile'

module Geom

  # when approximating CCD with an arcing body, a series of lines is used, each
  # which is travelled in ARC_DELTA seconds.
  ARC_DELTA = 0.01

  def self.quad_formula(a, b, c)
    #puts "a=#{a}\nb=#{b}\nc=#{c}"
    #puts "b^2-4ac = #{b**2 - 4*a*c}"
    sqrt = Math.sqrt b**2 - 4*a*c
    [(-b + sqrt).fdiv(2*a), (-b - sqrt).fdiv(2*a)]
  end

  def self.collision(missile, player, interval)
    if player.rot_speed != 0
      collision_arc missile, player, interval
    else
      collision_line missile, player, interval
    end
  end

  private

  def self.collision_arc(m, p, i)
    # break i into smaller time intervals and use line formula to approximate
    ifrom = i.first
    until ifrom == i.last
      ito = [ifrom + ARC_DELTA, i.last].min
      return true if collision_line m, p, ifrom..ifrom
      ifrom = ito
    end
    false
  end

  def self.collision_line(m, p, i)
    mi = m.instant i.first
    pi = p.instant i.first

    c1 = p.direction * p.speed * Math.cos(p.h) - m.speed * Math.cos(m.h)
    c2 = pi[:x] - mi[:x]
    c3 = p.direction * p.speed * Math.sin(p.h) - m.speed * Math.sin(m.h)
    c4 = pi[:y] - mi[:y]
    c5 = (p.r + m.r)**2

    #puts "c1=#{c1}\nc2=#{c2}\nc3=#{c3}\nc4=#{c4}\nc5=#{c5}"

    a = c1**2 + c3**2
    b = 2*(c1*c2 + c3*c4)
    c = c2**2 + c4**2 - c5

    if b**2 - 4*a*c >= 0
      t1, t2 = quad_formula a, b, c
      i.first + t1 <= i.last || i.first + t2 <= i.last
    else
      false
    end
  end

end

class World

  include Gamz::Server::Reactor

  attr_reader :width, :height, :clients, :players

  def initialize(width, height)
    @width, @height = width, height
    @players = {}
    @clients = {}
    @missiles = {}
    @last_id = 0
    @last_global = Time.now
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
    #hit_scan [player]
    player.direction = direction.to_i
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_rot_speed(player, rot_speed)
    #hit_scan [player]
    player.rot_speed = rot_speed.to_f
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_heading(player, heading)
    #hit_scan [player]
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

  def hit_scan_cont(players = nil)
    global = !players
    players ||= @players.values
    scan_time = Time.now
    @missiles.each_value do |m|
      hit = players.select do |p|
        p != m.player && Geom.collision(m, p, [@last_global, p.updated].max..scan_time)
      end
      if hit.any?
        hit.each{|p| p.score -= 1}
        m.player.score += hit.length
        @missiles.delete m.id
        notify_all :explosion, m.id, hit.map(&:id)
      end
    end
    @last_global = scan_time if global
  end

  def hit_scan_inst(players = nil)
    players ||= @players.values
    @missiles.each_value do |m|
      mi = m.instant
      if mi[:x] < 0 || mi[:x] > @width || mi[:y] < 0 || mi[:y] > @height
        # dispose of the missile once it's off the grid
        @missiles.delete m.id
        notify_all :explosion, m.id, []
      else
        hit = players.select do |p|
          pi = p.instant
          p != m.player && Math.hypot(pi[:x]-mi[:x], pi[:y]-mi[:y]) <= p.r + m.r
        end
        if hit.any?
          hit.each{|p| p.score -= 1}
          m.player.score += hit.length
          @missiles.delete m.id
          notify_all :explosion, m.id, hit.map(&:id)
        end
      end
    end
  end

  private

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
  world.players.each do |client, player|
    start = Time.now
    client.ping do
      player.latency = Time.now-start
    end
  end
end
server.each_ticks(1){world.hit_scan_inst}
server.start
