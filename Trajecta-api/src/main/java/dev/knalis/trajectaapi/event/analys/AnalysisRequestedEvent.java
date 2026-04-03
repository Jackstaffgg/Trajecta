package dev.knalis.trajectaapi.event.analys;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AnalysisRequestedEvent {
    private final Long taskId;
}


