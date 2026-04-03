package dev.knalis.trajectaapi.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static dev.knalis.trajectaapi.messaging.RabbitTopology.EXCHANGE;
import static dev.knalis.trajectaapi.messaging.RabbitTopology.PARSE_QUEUE;
import static dev.knalis.trajectaapi.messaging.RabbitTopology.PARSE_ROUTING_KEY;
import static dev.knalis.trajectaapi.messaging.RabbitTopology.RESULTS_QUEUE;
import static dev.knalis.trajectaapi.messaging.RabbitTopology.RESULTS_ROUTING_KEY;

@Configuration
public class RabbitMqConfig {

    @Bean
    public DirectExchange telemetryExchange() {
        return new DirectExchange(EXCHANGE, true, false);
    }

    @Bean
    public Queue telemetryParseQueue() {
        return new Queue(PARSE_QUEUE, true);
    }

    @Bean
    public Queue telemetryResultsQueue() {
        return new Queue(RESULTS_QUEUE, true);
    }

    @Bean
    public Binding telemetryParseBinding(Queue telemetryParseQueue, DirectExchange telemetryExchange) {
        return BindingBuilder.bind(telemetryParseQueue).to(telemetryExchange).with(PARSE_ROUTING_KEY);
    }

    @Bean
    public Binding telemetryResultsBinding(Queue telemetryResultsQueue, DirectExchange telemetryExchange) {
        return BindingBuilder.bind(telemetryResultsQueue).to(telemetryExchange).with(RESULTS_ROUTING_KEY);
    }
}

