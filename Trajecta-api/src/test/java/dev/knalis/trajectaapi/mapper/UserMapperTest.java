package dev.knalis.trajectaapi.mapper;

import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.model.Role;
import dev.knalis.trajectaapi.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserMapperTest {

    private UserMapperImpl mapper;
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUp() {
        mapper = new UserMapperImpl();
        passwordEncoder = mock(PasswordEncoder.class);
        ReflectionTestUtils.setField(mapper, "passwordEncoder", passwordEncoder);
    }

    @Test
    void updateUserFromDto_updatesProvidedFieldsAndEncodesPassword() {
        User user = new User();
        user.setUsername("old");
        user.setRole(Role.USER);

        UserUpdateRequest req = new UserUpdateRequest();
        req.setUsername("new");
        req.setPassword("password123");
        req.setRole("ADMIN");

        when(passwordEncoder.encode("password123")).thenReturn("ENC");

        mapper.updateUserFromDto(req, user);

        assertThat(user.getUsername()).isEqualTo("new");
        assertThat(user.getPassword()).isEqualTo("ENC");
        assertThat(user.getRole()).isEqualTo(Role.ADMIN);
    }

    @Test
    void updateUserFromDto_handlesNullAndBlankPasswordBranches() {
        User user = new User();
        user.setPassword("OLD");

        UserUpdateRequest nullPassword = new UserUpdateRequest();
        nullPassword.setName("N");
        mapper.updateUserFromDto(nullPassword, user);
        assertThat(user.getPassword()).isEqualTo("OLD");

        UserUpdateRequest blankPassword = new UserUpdateRequest();
        blankPassword.setPassword("   ");
        mapper.updateUserFromDto(blankPassword, user);
        assertThat(user.getPassword()).isNull();
    }

    @Test
    void mappingMethods_handleNullInputs() {
        assertThat(mapper.toDto(null)).isNull();
        assertThat(mapper.toDtoList(null)).isNull();

        User user = new User();
        user.setId(5L);
        user.setRole(Role.USER);
        assertThat(mapper.toDtoList(List.of(user))).hasSize(1);
    }

    @Test
    void toDto_handlesNullIdAndNullRole() {
        User user = new User();
        user.setId(null);
        user.setRole(null);
        user.setUsername("u");

        var dto = mapper.toDto(user);

        assertThat(dto.getId()).isZero();
        assertThat(dto.getRole()).isNull();
    }

    @Test
    void encodePassword_returnsNullForNullInput() {
        String encoded = ReflectionTestUtils.invokeMethod(mapper, "encodePassword", (String) null);
        assertThat(encoded).isNull();
    }

    @Test
    void updateUserFromDto_ignoresNullRequest() {
        User user = new User();
        user.setName("before");

        mapper.updateUserFromDto(null, user);

        assertThat(user.getName()).isEqualTo("before");
    }

    @Test
    void updateUserFromDto_updatesEmailWhenProvided() {
        User user = new User();
        UserUpdateRequest req = new UserUpdateRequest();
        req.setEmail("new@example.com");

        mapper.updateUserFromDto(req, user);

        assertThat(user.getEmail()).isEqualTo("new@example.com");
    }
}

