package dev.knalis.trajectaapi.event;

import dev.knalis.trajectaapi.event.analys.AnalysisRequestedEvent;
import dev.knalis.trajectaapi.event.task.TaskStatusChangedEvent;
import dev.knalis.trajectaapi.model.task.TaskStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EventPublisher {
    
    private final ApplicationEventPublisher eventPublisher;
    
    public void publishTaskStatusChanged(Long taskId, Long userId, String title, TaskStatus status, String message) {
        eventPublisher.publishEvent(TaskStatusChangedEvent.builder().taskId(taskId).userId(userId).taskTitle(title).taskStatus(status).message(message).build());
    }
    
    public void publishTaskStatusChanged(Long taskId, Long userId, String title, TaskStatus status) {
        publishTaskStatusChanged(taskId, userId, title, status, null);
    }
    
    public void publishAnalysisRequested(Long taskId) {
        eventPublisher.publishEvent(new AnalysisRequestedEvent(taskId));
    }
}


