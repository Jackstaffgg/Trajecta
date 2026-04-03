package dev.knalis.trajectaapi.mapper;

import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.model.User;
import org.mapstruct.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

@Mapper(componentModel = "spring")
public abstract class UserMapper {
    
    @Autowired
    protected PasswordEncoder passwordEncoder;
    
    @Mapping(target = "password", qualifiedByName = "encodePassword")
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    public abstract void updateUserFromDto(UserUpdateRequest request, @MappingTarget User user);
    
    public abstract UserResponse toDto(User user);
    
    public abstract List<UserResponse> toDtoList(List<User> users);
    
    @Named("encodePassword")
    protected String encodePassword(String rawPassword) {
        if (rawPassword == null || rawPassword.isBlank()) {
            return null;
        }
        return passwordEncoder.encode(rawPassword);
    }
}


