package dev.knalis.trajectaapi.repo;

import dev.knalis.trajectaapi.model.user.User;
import dev.knalis.trajectaapi.model.user.punishment.PunishmentType;
import dev.knalis.trajectaapi.model.user.punishment.UserPunishment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PunishmentRepository extends JpaRepository<UserPunishment, Long> {
    
    @Query("""
        select case when count(p) > 0 then true else false end
        from UserPunishment p
        where p.user = :user
          and p.type = :type
          and (p.expiredAt is null or p.expiredAt > :now)
    """)
    boolean existsActivePunishment(
            @Param("user") User user,
            @Param("type") PunishmentType type,
            @Param("now") Instant now
    );
    
    @Query("""
        select p
        from UserPunishment p
        where p.user = :user
          and (p.expiredAt is null or p.expiredAt > :now)
        order by p.createdAt desc
    """)
    List<UserPunishment> findActivePunishments(
            @Param("user") User user,
            @Param("now") Instant now
    );

    @Query("""
        select p
        from UserPunishment p
        where p.user = :user
          and p.type = :type
          and (p.expiredAt is null or p.expiredAt > :now)
        order by p.createdAt desc
    """)
    Optional<UserPunishment> findLatestActivePunishment(
            @Param("user") User user,
            @Param("type") PunishmentType type,
            @Param("now") Instant now
    );

    List<UserPunishment> findByUserOrderByCreatedAtDesc(User user);
}