package dev.knalis.trajectaapi.model.task;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Entity
@NoArgsConstructor
public class FlightTask {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String title;
    
    @Column(nullable = false)
    private Long userId;
    
    @Enumerated(EnumType.STRING)
    private TaskStatus status = TaskStatus.PENDING;
    
    private String rawLogObjectKey;
    private String trajectoryObjectKey;
    
    private boolean hasAiConclusion;
    private String errorMessage;
    
    private Instant createdAt = Instant.now();
    private Instant finishedAt;
    
    public void markCompleted(String trajectoryObjectKey) {
        this.status = TaskStatus.COMPLETED;
        this.trajectoryObjectKey = trajectoryObjectKey;
        this.errorMessage = null;
    }
    
    public void markFailed(String errorMessage) {
        this.status = TaskStatus.FAILED;
        this.errorMessage = errorMessage;
    }
}


