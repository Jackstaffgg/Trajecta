package dev.knalis.trajectaapi.config.props;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;


/*
  seed:
    enabled: ${APP_SEED_ENABLED:false}
    username: ${OWNER_USERNAME:Owner}
    password: ${OWNER_PASSWORD:Owner123}
    mail: ${OWNER_MAIL:owner@ownermail.own}
 */

@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "application.seed")
public class BaseSeedProperties {
    private boolean enabled = false;
    private String username = "Owner";
    private String password = "Owner123";
    private String mail = "owner@ownermail.own";
}
