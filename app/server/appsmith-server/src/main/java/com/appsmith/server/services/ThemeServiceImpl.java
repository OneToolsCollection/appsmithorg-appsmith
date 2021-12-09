package com.appsmith.server.services;

import com.appsmith.server.acl.AclPermission;
import com.appsmith.server.constants.FieldName;
import com.appsmith.server.domains.ApplicationMode;
import com.appsmith.server.domains.Theme;
import com.appsmith.server.exceptions.AppsmithError;
import com.appsmith.server.exceptions.AppsmithException;
import com.appsmith.server.repositories.ApplicationRepository;
import com.appsmith.server.repositories.ThemeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.convert.MongoConverter;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;

import javax.validation.Validator;

@Slf4j
@Service
public class ThemeServiceImpl extends BaseService<ThemeRepository, Theme, String> implements ThemeService {

    private final ApplicationRepository applicationRepository;

    public ThemeServiceImpl(Scheduler scheduler, Validator validator, MongoConverter mongoConverter, ReactiveMongoTemplate reactiveMongoTemplate, ThemeRepository repository, AnalyticsService analyticsService, ApplicationRepository applicationRepository) {
        super(scheduler, validator, mongoConverter, reactiveMongoTemplate, repository, analyticsService);
        this.applicationRepository = applicationRepository;
    }

    @Override
    public Flux<Theme> get(MultiValueMap<String, String> params) {
        return repository.getSystemThemes(); // return the list of system themes
    }

    @Override
    public Mono<Theme> create(Theme resource) {
        // user can get the list of themes under an application only
        throw new UnsupportedOperationException();
    }

    @Override
    public Mono<Theme> update(String s, Theme resource) {
        // we don't allow to update a theme by id, user can only update a theme under their application
        throw new UnsupportedOperationException();
    }

    @Override
    public Mono<Theme> getById(String s) {
        // TODO: better to add permission check
        return repository.findById(s);
    }

    @Override
    public Mono<Theme> getApplicationTheme(String applicationId, ApplicationMode applicationMode) {
        return applicationRepository.findById(applicationId, AclPermission.READ_APPLICATIONS)
                .switchIfEmpty(Mono.error(
                        new AppsmithException(AppsmithError.NO_RESOURCE_FOUND, FieldName.APPLICATION, applicationId))
                )
                .flatMap(application -> {
                    if(applicationMode == ApplicationMode.EDIT) {
                        return repository.findById(application.getEditModeThemeId());
                    } else {
                        return repository.findById(application.getPublishedModeThemeId());
                    }
                });
    }

    @Override
    public Mono<Theme> updateTheme(String applicationId, Theme resource) {
        return applicationRepository.findById(applicationId, AclPermission.MANAGE_APPLICATIONS)
                .flatMap(application -> {
                    // makes sure user has permission to edit application and an application exists by this applicationId
                    // check if this application has already a customized them
                    return repository.getByApplicationAndMode(applicationId, ApplicationMode.EDIT)
                            .defaultIfEmpty(new Theme())
                            .flatMap(theme -> {
                                theme.setApplicationId(applicationId);
                                theme.setApplicationMode(ApplicationMode.EDIT);

                                if(resource.getConfig() != null) {
                                    theme.setConfig(resource.getConfig());
                                }
                                if(resource.getStylesheet() != null) {
                                    theme.setStylesheet(resource.getStylesheet());
                                }
                                if(resource.getProperties() != null) {
                                    theme.setProperties(resource.getProperties());
                                }
                                theme.setName(resource.getName());
                                return repository.save(theme);
                            }).flatMap(savedTheme -> applicationRepository.setEditModeAppTheme(
                                    applicationId, savedTheme.getId(), AclPermission.MANAGE_APPLICATIONS
                            ).thenReturn(savedTheme));
                });
    }

    @Override
    public Mono<Theme> changeCurrentTheme(String themeId, String applicationId) {
        return applicationRepository.findById(applicationId, AclPermission.MANAGE_APPLICATIONS)
                .flatMap(application ->
                    repository.findById(themeId)
                            .flatMap(theme -> {
                                if(theme.getApplicationId() == null) {
                                    return applicationRepository.setEditModeAppTheme(
                                            applicationId, themeId, AclPermission.MANAGE_APPLICATIONS
                                    ).thenReturn(theme);
                                } else {
                                    // only system themes are allowed to set i.e. applicationId is null, otherwise error
                                    return Mono.error(new AppsmithException(AppsmithError.UNSUPPORTED_OPERATION));
                                }
                            })
                );
    }
}
