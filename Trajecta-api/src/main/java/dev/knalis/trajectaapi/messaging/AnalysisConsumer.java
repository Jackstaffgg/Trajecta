package dev.knalis.trajectaapi.messaging;

import dev.knalis.trajectaapi.dto.messaging.AnalysisResult;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.service.intrf.task.FlightTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisConsumer {

    private final FlightTaskService taskService;

    @RabbitListener(queues = RabbitTopology.RESULTS_QUEUE)
    public void handleAnalysisResult(AnalysisResult result) {
        if (result == null || result.getTaskId() == null) {
            log.warn("Skipping invalid analysis result message: payload or taskId is null");
            return;
        }

        log.info("Received analysis result for task: {}", result.getTaskId());
        try {
            taskService.completeTask(result);
        } catch (NotFoundException ex) {
            // Task can be deleted before delayed worker result arrives; treat as stale message.
            log.warn("Skipping stale analysis result for missing task {}", result.getTaskId());
        }
    }
}


