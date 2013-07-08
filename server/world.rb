require 'gamz/server'

class World

  include Gamz::Server::Reactor
  include CollisionDetection

  attr_reader :width, :height, :clients, :players

  def initialize(width, height)
    @width, @height = width, height
    @players = {}
    @clients = {}
    @missiles = {}
    @last_pid = @last_mid = 0
    #@last_global = Time.now
  end

  def x_coord(value)
    (value > width ? width : (value < 0 ? 0 : value)).to_f
  end

  def y_coord(value)
    (value > height ? height : (value < 0 ? 0 : value)).to_f
  end

  def on_connect(client)
    p = @players[client] = Player.new(self, @last_pid += 1)
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

  def react_state(player)
    [
      :success, @width, @height,
      @players.each_value.map(&:data), player.id,
      @missiles.each_value.map(&:data)
    ]
  end

  def react_m(player, motion)
    player.m = motion
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_d(player, direction)
    #hit_scan [player]
    player.d = direction
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_rot_speed(player, rot_speed)
    #hit_scan [player]
    player.rot_speed = rot_speed
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_h(player, heading)
    #hit_scan [player]
    player.h = heading
    notify_except player, :data, player.data
    [:success, player.data]
  end

  def react_fire(player)
    m = Missile.new(player, @last_mid += 1)
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
        p != m.player && collision(m, p, [@last_global, p.updated].max..scan_time)
      end
      if hit.any?
        #hit.each{|p| p.score -= 1}
        m.player.score += hit.length
        @missiles.delete m.id
        notify_all :hit, m.id, hit.map(&:id)
      end
    end
    @last_global = scan_time if global
  end

  def hit_scan_inst
    @players.each_value &:compute!
    @missiles.each_value do |m|
      mi = m.instant
      if mi[:x] < 0 || mi[:x] > @width || mi[:y] < 0 || mi[:y] > @height
        # dispose of the missile once it's out of bounds
        @missiles.delete m.id
        notify_all :hit, m.id, []
      else
        hit = @players.each_value.select do |p|
          p != m.player && Math.hypot(p.x-mi[:x], p.y-mi[:y]) <= p.r + m.r
        end
        if hit.any?
          #hit.each{|p| p.score -= 1}
          m.player.score += hit.length
          @missiles.delete m.id
          notify_all :hit, m.id, hit.map(&:id)
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