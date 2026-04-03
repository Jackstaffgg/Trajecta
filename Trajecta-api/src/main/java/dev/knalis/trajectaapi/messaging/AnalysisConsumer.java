package dev.knalis.trajectaapi.messaging;

import dev.knalis.trajectaapi.dto.messaging.AnalysisResult;
import dev.knalis.trajectaapi.service.intrf.FlightTaskService;
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
        log.info("Received analysis result for task: {}", result.getTaskId());
        taskService.completeTask(result);
    }
}


