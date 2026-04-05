package dev.knalis.trajectaapi.config;

import dev.knalis.trajectaapi.model.user.Role;
import dev.knalis.trajectaapi.model.user.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Order(2)
@Component
@ConditionalOnProperty(name = "application.seed.enabled", havingValue = "true")
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("knalis")) {
            
            User admin = new User();
            admin.setUsername("knalis");
            admin.setPassword(passwordEncoder.encode("Knl123"));
            admin.setName("System Administrator");
            admin.setEmail("knalis@knalis.com");
            admin.setRole(Role.ADMIN);
            
            userRepository.save(admin);
            
            System.out.println("=== Success: First admin is created ===");
            System.out.println("Login: knalis");
            System.out.println("Pass: Knl123");
            System.out.println("=========================================");
        }
        
        if (!userRepository.existsByUsername("knalisOwn")) {
            User owner = new User();
            owner.setUsername("knalisOwn");
            owner.setPassword(passwordEncoder.encode("Knl123"));
            owner.setName("System Owner");
            owner.setEmail("vitallot21@gmail.com");
            owner.setRole(Role.OWNER);
            
            userRepository.save(owner);
            System.out.println("=== Success: First owner is created ===");
            System.out.println("Login: knalisOwn");
            System.out.println("Pass: Knl123");
            System.out.println("========================================");
        }
    }
}


