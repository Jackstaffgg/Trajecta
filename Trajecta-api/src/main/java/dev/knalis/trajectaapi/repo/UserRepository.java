package dev.knalis.trajectaapi.repo;

import dev.knalis.trajectaapi.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;


@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    
    List<User> findByUsernameContainingIgnoreCase(String username);
    
    Optional<User> findByUsernameEqualsIgnoreCase(String username);
}


