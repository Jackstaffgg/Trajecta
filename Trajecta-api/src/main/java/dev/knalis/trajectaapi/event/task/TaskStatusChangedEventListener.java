package dev.knalis.trajectaapi.event.task;

import dev.knalis.trajectaapi.dto.ws.WsEventType;
import dev.knalis.trajectaapi.dto.ws.payload.TaskUpdateStatusPayload;
import dev.knalis.trajectaapi.service.intrf.WsEventDispatcher;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;

@Component
@RequiredArgsConstructor
public class TaskStatusChangedEventListener {
    
    private final WsEventDispatcher wsEventDispatcher;
    
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(TaskStatusChangedEvent event) {
        TaskUpdateStatusPayload payload = TaskUpdateStatusPayload.builder()
                .taskId(event.getTaskId())
                .taskStatus(event.getTaskStatus())
                .taskTitle(event.getTaskTitle())
                .message(event.getMessage())
                .build();
        
        wsEventDispatcher.emitToUsers(
                List.of(event.getUserId()),
                WsEventType.TASK_STATUS_UPDATE,
                payload
        );
    }
}


