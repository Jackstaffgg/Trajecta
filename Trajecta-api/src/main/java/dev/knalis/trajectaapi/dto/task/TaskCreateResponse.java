package dev.knalis.trajectaapi.dto.task;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@Schema(description = "Task creation result.")
public class TaskCreateResponse {
    
    @Schema(description = "Created task identifier.", example = "42")
    private Long id;

    @Schema(description = "Created task title.", example = "Flight #102 telemetry")
    private String title;

    @Schema(description = "Initial task status.", example = "PROCESSING")
    private String status;
}


