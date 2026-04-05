package dev.knalis.trajectaapi.messaging;

import dev.knalis.trajectaapi.dto.messaging.AnalysisResult;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.service.intrf.task.FlightTaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AnalysisConsumerTest {

    @Mock
    private FlightTaskService taskService;

    private AnalysisConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new AnalysisConsumer(taskService);
    }

    @Test
    void handleAnalysisResult_callsCompleteTask_forValidPayload() {
        AnalysisResult result = new AnalysisResult();
        result.setTaskId(42L);

        consumer.handleAnalysisResult(result);

        verify(taskService).completeTask(result);
    }

    @Test
    void handleAnalysisResult_ignoresNullPayload() {
        consumer.handleAnalysisResult(null);

        verify(taskService, never()).completeTask(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void handleAnalysisResult_ignoresPayloadWithNullTaskId() {
        AnalysisResult result = new AnalysisResult();

        consumer.handleAnalysisResult(result);

        verify(taskService, never()).completeTask(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void handleAnalysisResult_ignoresStaleResultWhenTaskMissing() {
        AnalysisResult result = new AnalysisResult();
        result.setTaskId(100L);
        doThrow(new NotFoundException("Task not found")).when(taskService).completeTask(result);

        consumer.handleAnalysisResult(result);

        verify(taskService).completeTask(result);
    }
}
