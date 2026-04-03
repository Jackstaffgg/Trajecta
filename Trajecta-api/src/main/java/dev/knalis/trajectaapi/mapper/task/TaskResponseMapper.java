package dev.knalis.trajectaapi.mapper.task;

import dev.knalis.trajectaapi.dto.task.TaskCreateResponse;
import dev.knalis.trajectaapi.dto.task.TaskResponse;
import dev.knalis.trajectaapi.model.task.FlightTask;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface TaskResponseMapper {
    
    @Mapping(target = "id", source = "id")
    @Mapping(target = "title", source = "title")
    @Mapping(target = "status", source = "status")
    @Mapping(target = "errorMessage", source = "errorMessage")
    @Mapping(target = "createdAt", source = "createdAt")
    @Mapping(target = "finishedAt", source = "finishedAt")
    TaskResponse toDto(FlightTask task);
    
    List<TaskResponse> toDtoList(List<FlightTask> tasks);
    
    @Mapping(target = "id", source = "id")
    @Mapping(target = "title", source = "title")
    @Mapping(target = "status", expression = "java(task.getStatus().name())")
    TaskCreateResponse toCreateResponse(FlightTask task);
}


