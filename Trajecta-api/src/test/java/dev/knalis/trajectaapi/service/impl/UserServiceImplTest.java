package dev.knalis.trajectaapi.service.impl;

import dev.knalis.trajectaapi.dto.auth.RegisterRequest;
import dev.knalis.trajectaapi.dto.user.UserCreateRequest;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.exception.BadRequestException;
import dev.knalis.trajectaapi.exception.FieldAlreadyExistException;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.model.Role;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private BCryptPasswordEncoder passwordEncoder;
    @Mock
    private UserMapper userMapper;
    @Mock
    private Authentication authentication;

    private UserServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new UserServiceImpl(userRepository, passwordEncoder, userMapper);
    }

    @Test
    void register_success() {
        RegisterRequest request = new RegisterRequest();
        request.setUsername("john");
        request.setPassword("password123");
        request.setEmail("j@x.com");
        request.setName("John");

        when(userRepository.existsByUsername("john")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("ENC");
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        User saved = service.register(request);

        assertThat(saved.getPassword()).isEqualTo("ENC");
        assertThat(saved.getRole()).isEqualTo(Role.USER);
    }

    @Test
    void create_deniesNonAdmin() {
        User creator = new User();
        creator.setRole(Role.USER);
        when(authentication.getPrincipal()).thenReturn(creator);

        assertThatThrownBy(() -> service.create(new UserCreateRequest(), authentication))
                .isInstanceOf(PermissionDeniedException.class);
    }

    @Test
    void create_throwsOnDuplicateUsername() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("dup");

        when(userRepository.existsByUsername("dup")).thenReturn(true);

        assertThatThrownBy(() -> service.create(req, authentication)).isInstanceOf(FieldAlreadyExistException.class);
    }

    @Test
    void update_checksUniqueUsername() {
        User existing = new User();
        existing.setId(1L);
        existing.setUsername("old");

        UserUpdateRequest req = new UserUpdateRequest();
        req.setUsername("new");

        when(userRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(userRepository.existsByUsername("new")).thenReturn(false);
        when(userRepository.save(existing)).thenReturn(existing);

        User saved = service.update(1L, req);

        assertThat(saved).isSameAs(existing);
        verify(userMapper).updateUserFromDto(req, existing);
    }

    @Test
    void register_throwsWhenUsernameAlreadyExists() {
        RegisterRequest request = new RegisterRequest();
        request.setUsername("john");
        when(userRepository.existsByUsername("john")).thenReturn(true);

        assertThatThrownBy(() -> service.register(request)).isInstanceOf(FieldAlreadyExistException.class);
    }

    @Test
    void create_throwsWhenRoleBlank() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("newuser");
        req.setRole(" ");
        when(userRepository.existsByUsername("newuser")).thenReturn(false);

        assertThatThrownBy(() -> service.create(req, authentication)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void create_throwsWhenRoleNull() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("newuser0");
        req.setRole(null);
        when(userRepository.existsByUsername("newuser0")).thenReturn(false);

        assertThatThrownBy(() -> service.create(req, authentication)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void create_throwsWhenRoleInvalid() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("newuser");
        req.setRole("superadmin");
        when(userRepository.existsByUsername("newuser")).thenReturn(false);

        assertThatThrownBy(() -> service.create(req, authentication)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void create_successForAdmin() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("pilot");
        req.setPassword("password123");
        req.setEmail("p@x.com");
        req.setName("Pilot");
        req.setRole("ADMIN");

        when(userRepository.existsByUsername("pilot")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("ENC");
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        User saved = service.create(req, authentication);

        assertThat(saved.getRole()).isEqualTo(Role.ADMIN);
        assertThat(saved.getPassword()).isEqualTo("ENC");
    }

    @Test
    void findByUsername_andFindById_throwWhenMissing() {
        when(userRepository.findByUsername("missing")).thenReturn(Optional.empty());
        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findByUsername("missing")).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.findById(999L)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void findAll_delete_andSearch_delegateToRepository() {
        when(userRepository.findAll()).thenReturn(List.of(new User()));
        when(userRepository.findByUsernameContainingIgnoreCase("al")).thenReturn(List.of(new User()));

        assertThat(service.findAll()).hasSize(1);
        assertThat(service.findByUsernameContaining("al")).hasSize(1);
        service.delete(1L);

        verify(userRepository).deleteById(1L);
    }

    @Test
    void update_throwsWhenUsernameTakenByAnotherUser() {
        User existing = new User();
        existing.setId(2L);
        existing.setUsername("old");

        UserUpdateRequest req = new UserUpdateRequest();
        req.setUsername("taken");

        when(userRepository.findById(2L)).thenReturn(Optional.of(existing));
        when(userRepository.existsByUsername("taken")).thenReturn(true);

        assertThatThrownBy(() -> service.update(2L, req)).isInstanceOf(FieldAlreadyExistException.class);
    }

    @Test
    void update_skipsUniqueCheckWhenUsernameUnchangedIgnoringCase() {
        User existing = new User();
        existing.setId(3L);
        existing.setUsername("Pilot");

        UserUpdateRequest req = new UserUpdateRequest();
        req.setUsername("pilot");

        when(userRepository.findById(3L)).thenReturn(Optional.of(existing));
        when(userRepository.save(existing)).thenReturn(existing);

        service.update(3L, req);

        verify(userRepository, never()).existsByUsername("pilot");
        verify(userMapper).updateUserFromDto(req, existing);
    }

    @Test
    void update_skipsUniqueCheckWhenUsernameNotProvided() {
        User existing = new User();
        existing.setId(4L);
        existing.setUsername("existing");

        UserUpdateRequest req = new UserUpdateRequest();
        req.setName("New Name");

        when(userRepository.findById(4L)).thenReturn(Optional.of(existing));
        when(userRepository.save(existing)).thenReturn(existing);

        service.update(4L, req);

        verify(userRepository, never()).existsByUsername(any());
        verify(userMapper).updateUserFromDto(req, existing);
    }

    @Test
    void create_acceptsLowercaseRoleByNormalizingToEnum() {
        User creator = new User();
        creator.setRole(Role.ADMIN);
        when(authentication.getPrincipal()).thenReturn(creator);

        UserCreateRequest req = new UserCreateRequest();
        req.setUsername("pilot2");
        req.setPassword("password123");
        req.setEmail("p2@x.com");
        req.setName("Pilot2");
        req.setRole("user");

        when(userRepository.existsByUsername("pilot2")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("ENC2");
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        User saved = service.create(req, authentication);

        assertThat(saved.getRole()).isEqualTo(Role.USER);
    }
}

