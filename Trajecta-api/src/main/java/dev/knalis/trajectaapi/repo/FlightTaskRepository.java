package dev.knalis.trajectaapi.repo;

import dev.knalis.trajectaapi.model.task.FlightTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FlightTaskRepository extends JpaRepository<FlightTask, Long> {
	Page<FlightTask> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
}


