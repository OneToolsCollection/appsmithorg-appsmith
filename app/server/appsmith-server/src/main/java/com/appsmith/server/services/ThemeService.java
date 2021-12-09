package com.appsmith.server.services;

import com.appsmith.server.domains.ApplicationMode;
import com.appsmith.server.domains.Theme;
import reactor.core.publisher.Mono;

public interface ThemeService extends CrudService<Theme, String> {
    Mono<Theme> getApplicationTheme(String applicationId, ApplicationMode applicationMode);
    Mono<Theme> updateTheme(String applicationId, Theme resource);
    Mono<Theme> changeCurrentTheme(String themeId, String applicationId);
}
