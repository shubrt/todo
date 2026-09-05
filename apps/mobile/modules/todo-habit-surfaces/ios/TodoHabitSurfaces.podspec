Pod::Spec.new do |s|
  s.name           = 'TodoHabitSurfaces'
  s.version        = '1.0.0'
  s.summary        = 'Habit widgets and Live Activities for todo'
  s.description    = 'Shared secure credentials, WidgetKit and ActivityKit integration.'
  s.license        = { :type => 'MIT' }
  s.author         = 'todo'
  s.homepage       = 'https://github.com/shubrt/todo'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'TodoHabitSurfacesModule.swift', 'Shared/*.swift'
  s.frameworks = 'WidgetKit', 'ActivityKit', 'AppIntents', 'Security', 'SwiftUI'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
