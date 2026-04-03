package dev.knalis.trajectaapi.dto.messaging;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Computed metrics from trajectory analysis.")
public class AnalysisMetrics {
    @Schema(description = "Maximum altitude in meters.", example = "1240.5")
    private Double maxAltitude;

    @Schema(description = "Maximum speed in meters per second.", example = "72.3")
    private Double maxSpeed;

    @Schema(description = "Flight duration in seconds.", example = "542.1")
    private Double flightDuration;

    @Schema(description = "Total traveled distance in meters.", example = "15432.8")
    private Double distance;
}


