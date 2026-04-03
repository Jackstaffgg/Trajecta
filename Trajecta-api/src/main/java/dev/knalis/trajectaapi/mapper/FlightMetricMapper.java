package dev.knalis.trajectaapi.mapper;

import dev.knalis.trajectaapi.dto.messaging.AnalysisMetrics;
import dev.knalis.trajectaapi.model.task.FlightMetrics;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface FlightMetricMapper {
    
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "taskId", source = "taskId")
    @Mapping(target = "maxAltitude", source = "metrics.maxAltitude")
    @Mapping(target = "maxSpeed", source = "metrics.maxSpeed")
    @Mapping(target = "flightDuration", source = "metrics.flightDuration")
    @Mapping(target = "distance", source = "metrics.distance")
    FlightMetrics mapMetrics(Long taskId, AnalysisMetrics metrics);
}


