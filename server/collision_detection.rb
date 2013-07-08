module CollisionDetection

  # when approximating CCD with an arcing body, a series of lines is used, each
  # which is travelled in ARC_DELTA seconds.
  ARC_DELTA = 0.01

  def quad_formula(a, b, c)
    #puts "a=#{a}\nb=#{b}\nc=#{c}"
    #puts "b^2-4ac = #{b**2 - 4*a*c}"
    sqrt = Math.sqrt b**2 - 4*a*c
    [(-b + sqrt).fdiv(2*a), (-b - sqrt).fdiv(2*a)]
  end

  def collision(missile, player, interval)
    if player.rot_speed != 0
      collision_arc missile, player, interval
    else
      collision_line missile, player, interval
    end
  end

  def collision_arc(m, p, i)
    # break i into smaller time intervals and use line formula to approximate
    ifrom = i.first
    until ifrom == i.last
      ito = [ifrom + ARC_DELTA, i.last].min
      return true if collision_line m, p, ifrom..ifrom
      ifrom = ito
    end
    false
  end

  def collision_line(m, p, i)
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