package dev.knalis.trajectaapi.messaging;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AnalysisProducer {

    private final RabbitTemplate rabbitTemplate;
    
    public void sendForAnalysis(Long taskId) {
        rabbitTemplate.convertAndSend(
                RabbitTopology.EXCHANGE,
                RabbitTopology.PARSE_ROUTING_KEY,
                new AnalysisRequest(taskId)
        );
    }
    
    @Data
    @AllArgsConstructor
    public static class AnalysisRequest {
        private Long taskId;
    }
}


