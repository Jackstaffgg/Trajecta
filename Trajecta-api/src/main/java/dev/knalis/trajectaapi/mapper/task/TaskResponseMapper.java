package dev.knalis.trajectaapi.mapper.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.knalis.trajectaapi.dto.task.TaskCreateResponse;
import dev.knalis.trajectaapi.dto.task.TaskResponse;
import dev.knalis.trajectaapi.model.task.FlightTask;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Mapper(componentModel = "spring")
public abstract class TaskResponseMapper {
    
    @Autowired
    protected ObjectMapper objectMapper;

    @Mapping(target = "id", source = "id")
    @Mapping(target = "title", source = "title")
    @Mapping(target = "status", source = "status")
    @Mapping(target = "errorMessage", source = "errorMessage")
    @Mapping(target = "createdAt", source = "createdAt")
    @Mapping(target = "finishedAt", source = "finishedAt")
    public abstract TaskResponse toDto(FlightTask task);

    public List<TaskResponse> toDtoList(List<?> tasks) {
        if (tasks == null) {
            return null;
        }
        if (tasks.isEmpty()) {
            return List.of();
        }

        List<TaskResponse> result = new ArrayList<>(tasks.size());
        for (Object entry : tasks) {
            FlightTask task;
            if (entry instanceof FlightTask casted) {
                task = casted;
            } else if (entry instanceof Map<?, ?>) {
                task = objectMapper.convertValue(entry, FlightTask.class);
            } else {
                throw new IllegalArgumentException("Unsupported task list entry type: " + entry.getClass());
            }
            result.add(toDto(task));
        }
        return result;
    }
    
    @Mapping(target = "id", source = "id")
    @Mapping(target = "title", source = "title")
    @Mapping(target = "status", expression = "java(task.getStatus().name())")
    public abstract TaskCreateResponse toCreateResponse(FlightTask task);
}
