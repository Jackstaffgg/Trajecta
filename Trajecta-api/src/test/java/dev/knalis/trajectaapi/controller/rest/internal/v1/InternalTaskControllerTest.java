package dev.knalis.trajectaapi.controller.rest.internal.v1;

import dev.knalis.trajectaapi.service.intrf.FileService;
import dev.knalis.trajectaapi.service.intrf.FlightTaskService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InternalTaskControllerTest {

    @Mock
    private FlightTaskService flightTaskService;
    @Mock
    private FileService fileService;

    private InternalTaskController controller;

    @BeforeEach
    void setUp() {
        controller = new InternalTaskController(flightTaskService, fileService);
        ReflectionTestUtils.setField(controller, "workerToken", "secret-token");
    }

    @Test
    void getRawForWorker_rejectsInvalidToken() {
        assertThatThrownBy(() -> controller.getRawForWorker(1L, "bad"))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void getRawForWorker_rejectsNullOrBlankToken() {
        assertThatThrownBy(() -> controller.getRawForWorker(1L, null)).isInstanceOf(BadCredentialsException.class);
        assertThatThrownBy(() -> controller.getRawForWorker(1L, "   ")).isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void getRawForWorker_rejectsWhenConfiguredWorkerTokenIsBlank() {
        ReflectionTestUtils.setField(controller, "workerToken", " ");

        assertThatThrownBy(() -> controller.getRawForWorker(1L, "secret-token"))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void getRawForWorker_rejectsWhenConfiguredWorkerTokenIsNull() {
        ReflectionTestUtils.setField(controller, "workerToken", null);

        assertThatThrownBy(() -> controller.getRawForWorker(1L, "secret-token"))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void getRawForWorker_returnsStreamForValidToken() throws Exception {
        when(flightTaskService.getTaskRawKeyInternal(2L)).thenReturn("tasks/2/2/raw/source.bin");
        when(fileService.getObjectStream("tasks/2/2/raw/source.bin"))
                .thenReturn(new ByteArrayInputStream("worker".getBytes()));

        var response = controller.getRawForWorker(2L, "secret-token");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        response.getBody().writeTo(out);

        assertThat(out.toString()).isEqualTo("worker");
    }
}

