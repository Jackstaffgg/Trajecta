package dev.knalis.trajectaapi.mapper.task;

import dev.knalis.trajectaapi.model.task.FlightTask;
import dev.knalis.trajectaapi.model.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TaskResponseMapperTest {

    private final TaskResponseMapper mapper = Mappers.getMapper(TaskResponseMapper.class);

    @Test
    void toCreateResponse_usesStatusName() {
        FlightTask task = new FlightTask();
        task.setId(9L);
        task.setTitle("T");
        task.setStatus(TaskStatus.PROCESSING);

        var response = mapper.toCreateResponse(task);

        assertThat(response.getId()).isEqualTo(9L);
        assertThat(response.getStatus()).isEqualTo("PROCESSING");
    }

    @Test
    void toDto_andToCreateResponse_returnNullForNullInput() {
        assertThat(mapper.toDto(null)).isNull();
        assertThat(mapper.toCreateResponse(null)).isNull();
    }

    @Test
    void toDtoList_mapsAndHandlesNullInput() {
        FlightTask task = new FlightTask();
        task.setId(1L);
        task.setStatus(TaskStatus.COMPLETED);

        assertThat(mapper.toDtoList(List.of(task))).hasSize(1);
        assertThat(mapper.toDtoList(null)).isNull();
    }
}

