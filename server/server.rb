#!/usr/bin/env ruby
require_relative 'player'
require_relative 'missile'
require_relative 'collision_detection'
require_relative 'world'

world = World.new 640, 480
server = Gamz::Server.new world
server.listen 10000
server.listen_ws 10001
server.each_seconds 3, preemptive: false do
  world.players.each do |client, player|
    start = Time.now
    client.ping do
      player.rtt = Time.now-start
    end
  end
end
server.each_ticks(1){world.hit_scan_inst}
begin
  server.start
rescue Exception => e
  puts "EXITING (#{e.inspect})"
  server.cleanup
end
